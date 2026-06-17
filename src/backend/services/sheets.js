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
// Bot-owned: A–J  (row_id, discord_id, username, display_name, joined_at, rank, level,
//                  current_warning, prior_warnings, active_restrictions)
// Human-owned: aliases + notes (legacy J–K or current K–L) — never written by bot
const MEMBER_BOT_RANGE = 'Members_Data!A:J';

function columnLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Locate aliases/notes columns from row 1 headers (supports old J–K and new K–L layouts). */
async function resolveHumanColumns(sheets) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.sheets.membersId,
    range: 'Members_Data!1:1',
  });
  const headers = (res.data.values?.[0] || []).map(h => String(h).trim().toLowerCase());

  let aliasesIdx = headers.indexOf('aliases');
  let notesIdx = headers.indexOf('notes');

  if (aliasesIdx === -1) aliasesIdx = headers.includes('display_name') ? 10 : 9;
  if (notesIdx === -1) notesIdx = aliasesIdx + 1;

  const aliasesCol = columnLetter(aliasesIdx);
  const notesCol = columnLetter(notesIdx);

  return {
    aliasesIdx,
    notesIdx,
    aliasesCol,
    notesCol,
    readRange: `Members_Data!${aliasesCol}:${notesCol}`,
  };
}
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
    const humanCols = await resolveHumanColumns(sheets);

    const humanData = await sheets.spreadsheets.values.get({
      spreadsheetId: env.sheets.membersId,
      range: humanCols.readRange,
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

    const header = [['row_id','discord_id','username','display_name','joined_at','rank','level',
                      'current_warning','prior_warnings','active_restrictions']];
    const rows = members.map((m, i) => [
      i + 2,
      m.discord_id,
      m.username,
      m.display_name || m.username,
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

    logger.info(`Members_Data synced — ${members.length} rows written (columns A–J only)`);
    return humanByDiscordId;
  });
}

/** Update human-owned columns K–L for one member row. */
export async function updateMemberHumanFields(discordId, aliases, notes) {
  return withLock('update_member_human', async () => {
    const sheets = await getSheetsClient();
    const humanCols = await resolveHumanColumns(sheets);

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

    const { aliasesCol, notesCol } = humanCols;
    await sheets.spreadsheets.values.update({
      spreadsheetId: env.sheets.membersId,
      range: `Members_Data!${aliasesCol}${rowIndex}:${notesCol}${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[aliases ?? '', notes ?? '']] },
    });

    logger.info(`Members_Data human columns updated for ${discordId} (row ${rowIndex}, ${aliasesCol}:${notesCol})`);
  });
}

export async function getHumanColumns() {
  const sheets = await getSheetsClient();
  const humanCols = await resolveHumanColumns(sheets);

  const [ids, human] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: env.sheets.membersId,
      range: 'Members_Data!B:B',
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: env.sheets.membersId,
      range: humanCols.readRange,
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