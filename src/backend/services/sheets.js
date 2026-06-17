import { google } from 'googleapis';
import { getDb } from '../db/client.js';
import logger from '../logger.js';
import env from '../config/env.js';

let _sheets = null;

async function getSheetsClient() {
  if (_sheets) return _sheets;
  const auth = new google.auth.GoogleAuth({
    keyFile: env.sheets.saKeyPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

const writeQueue = [];
let processing = false;

function acquireLock(operation) {
  const db = getDb();
  const lock = db.prepare('SELECT locked, locked_by FROM sheet_locks WHERE id = 1').get();
  if (lock.locked) {
    throw new Error(`Sheet is locked by operation: ${lock.locked_by}`);
  }
  db.prepare(`
    UPDATE sheet_locks SET locked = 1, locked_by = ?, locked_at = datetime('now') WHERE id = 1
  `).run(operation);
}

function releaseLock() {
  getDb()
    .prepare('UPDATE sheet_locks SET locked = 0, locked_by = NULL, locked_at = NULL WHERE id = 1')
    .run();
}

async function withLock(operation, fn) {
  return new Promise((resolve, reject) => {
    writeQueue.push({ operation, fn, resolve, reject });
    processQueue();
  });
}

async function processQueue() {
  if (processing || writeQueue.length === 0) return;
  processing = true;
  const { operation, fn, resolve, reject } = writeQueue.shift();
  try {
    acquireLock(operation);
    const result = await fn();
    resolve(result);
  } catch (err) {
    reject(err);
  } finally {
    releaseLock();
    processing = false;
    processQueue();
  }
}

// ── Column layout constants ───────────────────────────────────
// Bot-owned: A–I  (row_id, discord_id, username, joined_at, rank, level,
//                  current_warning, prior_warnings, active_restrictions)
// Human-owned: J–K (aliases, notes) — never written by bot
const MEMBER_BOT_RANGE   = 'Members_Data!A:I';
const MEMBER_HUMAN_RANGE = 'Members_Data!J:K';  
const WARNINGS_RANGE     = 'Warnings_Data!A:J';

// ── Warnings ──────────────────────────────────────────────────

export async function appendWarning(warning) {
  return withLock('append_warning', async () => {
    const sheets = await getSheetsClient();
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: env.sheets.warningsId,
      range: 'Warnings_Data!A:A',
    });
    const ids = (existing.data.values || []).map(r => r[0]);
    if (ids.includes(String(warning.id))) {
      logger.debug(`Warning ${warning.id} already in Sheets — skipping append`);
      return;
    }

    const row = [
      warning.id,
      warning.discord_id,
      warning.username,
      warning.level,
      warning.reason,
      warning.issued_by_name,
      warning.issued_at,
      warning.expires_at || '',
      warning.expired ? 'Yes' : 'No',
      warning.escalated_from || '',
    ];

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: env.sheets.warningsId,
      range: WARNINGS_RANGE,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    const updatedRange = response.data.updates?.updatedRange || '';
    const rowMatch = updatedRange.match(/(\d+)$/);
    if (rowMatch) {
      getDb()
        .prepare('UPDATE warnings SET sheets_row = ? WHERE id = ?')
        .run(parseInt(rowMatch[1], 10), warning.id);
    }

    logger.info(`Warning ${warning.id} appended to Sheets`);
  });
}

export async function updateWarningRow(warning) {
  if (!warning.sheets_row) {
    logger.warn(`Warning ${warning.id} has no sheets_row — appending instead`);
    return appendWarning(warning);
  }

  return withLock('update_warning', async () => {
    const sheets = await getSheetsClient();
    const range = `Warnings_Data!A${warning.sheets_row}:J${warning.sheets_row}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: env.sheets.warningsId,
      range,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          warning.id,
          warning.discord_id,
          warning.username,
          warning.level,
          warning.reason,
          warning.issued_by_name,
          warning.issued_at,
          warning.expires_at || '',
          warning.expired ? 'Yes' : 'No',
          warning.escalated_from || '',
        ]],
      },
    });

    logger.info(`Warning ${warning.id} updated in Sheets (row ${warning.sheets_row})`);
  });
}

// ── Members ───────────────────────────────────────────────────

export async function syncMembers(members) {
  return withLock('sync_members', async () => {
    const sheets = await getSheetsClient();

    const humanData = await sheets.spreadsheets.values.get({
      spreadsheetId: env.sheets.membersId,
      range: MEMBER_HUMAN_RANGE,
    });
    const humanRows = humanData.data.values || [];

    // build map of discord_id → { aliases, notes } from the existing sheet
    const existingBotIds = await sheets.spreadsheets.values.get({
      spreadsheetId: env.sheets.membersId,
      range: 'Members_Data!B:B',
    });
    const idRows = (existingBotIds.data.values || []).slice(1);
    const humanByDiscordId = {};
    idRows.forEach((row, i) => {
      if (row[0]) {
        humanByDiscordId[row[0]] = {
          aliases: humanRows[i + 1]?.[0] || '',
          notes:   humanRows[i + 1]?.[1] || '',
        };
      }
    });

    const header = [['row_id','discord_id','username','joined_at','rank','level',
                      'current_warning','prior_warnings','active_restrictions']];
    const rows = members.map((m, i) => [
      i + 2,
      m.discord_id,
      m.username,
      m.joined_at || '',
      m.rank || '',
      m.level ?? '',
      m.current_warning || '',
      m.prior_warnings || '',
      m.active_restrictions || '',
    ]);

    await sheets.spreadsheets.values.update({
      spreadsheetId: env.sheets.membersId,
      range: MEMBER_BOT_RANGE,
      valueInputOption: 'RAW',
      requestBody: { values: [...header, ...rows] },
    });

    logger.info(`Members_Data synced — ${members.length} rows written (columns A–I only)`);
    return humanByDiscordId;
  });
}

/** Update human-owned columns J–K for one member row. */
export async function updateMemberHumanFields(discordId, aliases, notes) {
  return withLock('update_member_human', async () => {
    const sheets = await getSheetsClient();

    const idCol = await sheets.spreadsheets.values.get({
      spreadsheetId: env.sheets.membersId,
      range: 'Members_Data!B:B',
    });
    const rows = idCol.data.values || [];
    let rowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === discordId) {
        rowIndex = i + 1;
        break;
      }
    }
    if (rowIndex === -1) {
      throw new Error('Member not found in Sheets — run a member sync first');
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: env.sheets.membersId,
      range: `Members_Data!J${rowIndex}:K${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[aliases ?? '', notes ?? '']] },
    });

    logger.info(`Members_Data human columns updated for ${discordId} (row ${rowIndex})`);
  });
}

export async function getHumanColumns() {
  const sheets = await getSheetsClient();

  const [ids, human] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: env.sheets.membersId,
      range: 'Members_Data!B:B',
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: env.sheets.membersId,
      range: MEMBER_HUMAN_RANGE,
    }),
  ]);

  const idRows    = (ids.data.values   || []).slice(1);
  const humanRows = (human.data.values || []).slice(1);
  const result = {};
  idRows.forEach((row, i) => {
    if (row[0]) {
      result[row[0]] = {
        aliases: humanRows[i]?.[0] || '',
        notes:   humanRows[i]?.[1] || '',
      };
    }
  });
  return result;
}