#!/usr/bin/env node
/**
 * One-off import of legacy enforcement CSV into warnings DB + Google Sheets.
 *
 * Usage:
 *   node scripts/import-warnings.mjs <csvPath> [--apply] [--mapping overrides.json]
 *
 * Dry-run by default. Does NOT execute Discord bans — historical records only.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { initDb, getDb } from '../db/client.js';
import { appendWarning } from '../services/sheets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEGACY_ISSUER_ID = 'legacy-import';
const VALID_LEVELS = new Set(['0', '1', '2A', '2B', '3', '4']);

// ── CLI ───────────────────────────────────────────────────────

function parseArgs(argv) {
  const positional = [];
  let apply = false;
  let mappingPath = null;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') apply = true;
    else if (arg === '--mapping') mappingPath = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/import-warnings.mjs <csvPath> [--apply] [--mapping overrides.json]');
      process.exit(0);
    } else positional.push(arg);
  }

  if (!positional[0]) {
    console.error('Error: CSV path required');
    process.exit(1);
  }

  return {
    csvPath: resolve(positional[0]),
    apply,
    mappingPath: mappingPath ? resolve(mappingPath) : null,
  };
}

// ── CSV ───────────────────────────────────────────────────────

function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseWarningsCsv(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const f = parseCsvLine(lines[i]);
    const identity = (f[0] ?? '').trim();
    if (!identity) continue;
    rows.push({
      identity,
      reason: (f[1] ?? '').trim(),
      levelRaw: (f[2] ?? '').trim(),
      startRaw: (f[3] ?? '').trim(),
      endRaw: (f[4] ?? '').trim(),
      issuedBy: (f[5] ?? '').trim(),
      evidence: (f[6] ?? '').trim(),
      notes: (f[7] ?? '').trim(),
    });
  }
  return rows;
}

function escapeCsvField(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeReportCsv(path, headers, rows) {
  const lines = [headers.map(escapeCsvField).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escapeCsvField(row[h])).join(','));
  }
  writeFileSync(path, lines.join('\n') + '\n', 'utf8');
}

// ── Normalization & fuzzy ─────────────────────────────────────

function normalize(value) {
  if (value == null) return '';
  return String(value).trim().replace(/^@+/, '').replace(/\s+/g, ' ').toLowerCase();
}

function splitAliasTokens(value) {
  if (!value) return [];
  return value.split(',').map(t => t.trim()).filter(Boolean);
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function stripLegacyTag(name) {
  return String(name).replace(/#\d{4}$/, '').trim();
}

function uniqueByDiscordId(members) {
  const seen = new Map();
  for (const m of members) seen.set(m.discord_id, m);
  return [...seen.values()];
}

function pickSingle(candidates, method) {
  const unique = uniqueByDiscordId(candidates);
  if (unique.length === 1) return { member: unique[0], method };
  if (unique.length > 1) return { ambiguous: unique, method };
  return null;
}

// ── Warning-specific parsing ──────────────────────────────────

function parseIdentity(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return { skip: true, reason: 'empty_identity' };
  if (trimmed.includes('+')) return { skip: true, reason: 'multiple_subjects' };

  const names = [];
  const paren = trimmed.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    names.push(stripLegacyTag(paren[2]));
    names.push(stripLegacyTag(paren[1]));
  } else if (trimmed.includes('/')) {
    for (const part of trimmed.split('/')) names.push(stripLegacyTag(part));
  } else {
    names.push(stripLegacyTag(trimmed));
  }

  return { names: [...new Set(names.map(n => n.trim()).filter(Boolean))] };
}

function parseLevel(raw) {
  const s = raw.trim();
  const upper = s.toUpperCase();

  if (/^S\s*-/.test(upper) || upper.includes('SPECIAL')) {
    return { skip: true, reason: 'special_level' };
  }
  if (/^V\s*-/.test(upper) || upper.includes('VENTING BAN')) {
    return { skip: true, reason: 'venting_ban' };
  }

  if (/^0\b/.test(upper)) return { level: '0' };
  if (/^1\s*-/.test(upper) || upper.startsWith('1 ')) return { level: '1' };
  if (/^2A/.test(upper) || upper.includes('14 DAY')) return { level: '2A' };
  if (/^2B/.test(upper) || (upper.includes('1 MONTH BAN') && !/^3\s/.test(upper))) return { level: '2B' };
  if (/^3\s*-/.test(upper) || /^3\b/.test(upper)) return { level: '3' };
  if (/^4\s*-/.test(upper) || /^4\b/.test(upper)) return { level: '4' };
  if (/^2\s*-/.test(upper) || upper.includes('2 WEEK')) return { level: '2A' };

  return { skip: true, reason: 'unmapped_level', detail: raw };
}

function parseDateDMY(raw) {
  if (!raw) return null;
  const t = raw.trim();
  if (t === '-' || t === '/') return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00.000Z`;
}

function buildReason(row, panelLevel) {
  let text = row.reason || '(no reason recorded)';
  if (row.levelRaw) text = `[Legacy: ${row.levelRaw} → L${panelLevel}]\n${text}`;
  if (row.evidence) text += `\n\nEvidence: ${row.evidence}`;
  if (row.notes) text += `\n\nNotes: ${row.notes}`;
  return text.trim();
}

function computeExpired(row, issuedAt, expiresAt) {
  const blob = `${row.notes} ${row.reason} ${row.evidence}`.toLowerCase();
  if (/rescinded|revoked/.test(blob)) return { expired: 1, expiredAt: issuedAt };

  const end = row.endRaw.trim();
  if ((end === '-' || end === '/') && expiresAt == null) return { expired: 1, expiredAt: issuedAt };

  if (expiresAt) {
    const expired = new Date(expiresAt) < new Date() ? 1 : 0;
    return { expired, expiredAt: expired ? expiresAt : null };
  }

  if (issuedAt && new Date(issuedAt) < new Date(Date.now() - 730 * 86400000)) {
    return { expired: 1, expiredAt: issuedAt };
  }

  return { expired: 0, expiredAt: null };
}

// ── Member matching ───────────────────────────────────────────

function buildIndexes(members) {
  const byUsername = new Map();
  const byDisplayName = new Map();
  const byAliasToken = new Map();

  function addTo(map, key, member) {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(member);
  }

  for (const m of members) {
    addTo(byUsername, normalize(m.username), m);
    addTo(byDisplayName, normalize(m.display_name), m);
    for (const token of splitAliasTokens(m.aliases)) {
      addTo(byAliasToken, normalize(token), m);
    }
  }

  return { byUsername, byDisplayName, byAliasToken, byId: new Map(members.map(m => [m.discord_id, m])) };
}

function lookup(map, key) {
  return map.get(normalize(key)) ?? [];
}

function matchMember(names, indexes) {
  for (const name of names) {
    const tiers = [
      { method: 'exact_username', candidates: () => lookup(indexes.byUsername, name) },
      { method: 'exact_display_name', candidates: () => lookup(indexes.byDisplayName, name) },
      { method: 'name_in_member_aliases', candidates: () => lookup(indexes.byAliasToken, name) },
      {
        method: 'fuzzy_username',
        candidates: () => {
          const target = normalize(name);
          if (!target) return [];
          return uniqueByDiscordId([].concat(...[...indexes.byUsername.values()].flat()))
            .filter(m => {
              const u = normalize(m.username);
              return u && levenshtein(target, u) <= 2;
            });
        },
      },
    ];

    for (const tier of tiers) {
      const result = pickSingle(tier.candidates(), tier.method);
      if (result?.member) return { status: 'matched', member: result.member, method: `${tier.method}:${name}` };
      if (result?.ambiguous) return { status: 'ambiguous', candidates: result.ambiguous, method: tier.method, name };
    }
  }

  return { status: 'unmatched' };
}

function loadMapping(path) {
  if (!path) return new Map();
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const map = new Map();
  for (const [key, discordId] of Object.entries(raw)) {
    map.set(key.trim(), String(discordId).trim());
    map.set(normalize(key), String(discordId).trim());
  }
  return map;
}

function resolveManual(row, mapping, byId, identityNames = []) {
  const keys = [row.identity, ...identityNames];
  for (const key of keys) {
    const discordId = mapping.get(key) ?? mapping.get(normalize(key));
    if (!discordId) continue;
    const member = byId.get(discordId);
    if (!member) return { status: 'unmatched', reason: `mapping discord_id ${discordId} not in DB` };
    return { status: 'matched', member, method: 'manual_mapping' };
  }
  return null;
}

function candidateSummary(members) {
  return members
    .map(m => `${m.discord_id}|${m.username}|${m.display_name ?? ''}|${m.rank ?? ''}`)
    .join('; ');
}

function warningExists(db, discordId, level, issuedAt, reason) {
  const row = db.prepare(`
    SELECT id FROM warnings
    WHERE discord_id = ? AND level = ? AND issued_at = ? AND reason = ?
  `).get(discordId, level, issuedAt, reason);
  return !!row;
}

// ── Apply ─────────────────────────────────────────────────────

async function applyWarning(row, member, panelLevel, issuedAt, expiresAt, expired, expiredAt, apply) {
  const reason = buildReason(row, panelLevel);
  const issuedByName = row.issuedBy || 'Unknown';

  if (!apply) {
    return { dbOk: null, sheetsOk: null, warningId: null, reason };
  }

  const db = getDb();

  if (warningExists(db, member.discord_id, panelLevel, issuedAt, reason)) {
    return { dbOk: false, sheetsOk: null, warningId: null, reason, duplicate: true };
  }

  if (!VALID_LEVELS.has(panelLevel)) {
    throw new Error(`Invalid panel level ${panelLevel}`);
  }

  const config = db.prepare('SELECT level FROM warning_config WHERE level = ?').get(panelLevel);
  if (!config) {
    throw new Error(`Warning level ${panelLevel} not configured — complete /setup first`);
  }

  const result = db.prepare(`
    INSERT INTO warnings (
      discord_id, username, level, reason,
      issued_by_id, issued_by_name,
      issued_at, expires_at, expired, expired_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    member.discord_id,
    member.username,
    panelLevel,
    reason,
    LEGACY_ISSUER_ID,
    issuedByName,
    issuedAt,
    expiresAt,
    expired,
    expiredAt,
  );

  const warning = db.prepare('SELECT * FROM warnings WHERE id = ?').get(result.lastInsertRowid);

  let sheetsOk = true;
  let sheetsError = null;
  try {
    await appendWarning(warning);
  } catch (err) {
    sheetsOk = false;
    sheetsError = err.message;
    console.warn(`  Sheets skip warning ${warning.id} (${member.username}): ${err.message}`);
  }

  return { dbOk: true, sheetsOk, warningId: warning.id, reason, sheetsError };
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const { csvPath, apply, mappingPath } = parseArgs(process.argv);
  const logDir = process.env.LOG_DIR || join(__dirname, '../logs');
  mkdirSync(logDir, { recursive: true });

  console.log(`CSV:     ${csvPath}`);
  console.log(`Mode:    ${apply ? 'APPLY (writes DB + Sheets, no Discord actions)' : 'DRY RUN'}`);
  if (mappingPath) console.log(`Mapping: ${mappingPath}`);

  const csvRows = parseWarningsCsv(readFileSync(csvPath, 'utf8'));
  const mapping = loadMapping(mappingPath);

  initDb();
  const db = getDb();
  const members = db.prepare('SELECT * FROM members').all();
  const indexes = buildIndexes(members);

  console.log(`Loaded ${csvRows.length} CSV rows, ${members.length} DB members\n`);

  const matched = [];
  const unmatched = [];
  const ambiguous = [];
  const skipped = [];

  for (const row of csvRows) {
    const levelResult = parseLevel(row.levelRaw);
    if (levelResult.skip) {
      skipped.push({
        csv_identity: row.identity,
        csv_level: row.levelRaw,
        csv_reason: row.reason,
        skip_reason: levelResult.reason,
        detail: levelResult.detail ?? '',
      });
      continue;
    }

    const identityResult = parseIdentity(row.identity);
    if (identityResult.skip) {
      skipped.push({
        csv_identity: row.identity,
        csv_level: row.levelRaw,
        csv_reason: row.reason,
        skip_reason: identityResult.reason,
        detail: '',
      });
      continue;
    }

    const issuedAt = parseDateDMY(row.startRaw);
    if (!issuedAt) {
      skipped.push({
        csv_identity: row.identity,
        csv_level: row.levelRaw,
        csv_reason: row.reason,
        skip_reason: 'invalid_start_date',
        detail: row.startRaw,
      });
      continue;
    }

    const expiresAt = parseDateDMY(row.endRaw);
    const { expired, expiredAt } = computeExpired(row, issuedAt, expiresAt);
    const panelLevel = levelResult.level;

    let result = resolveManual(row, mapping, indexes.byId, identityResult.names);
    if (!result) result = matchMember(identityResult.names, indexes);

    if (result.status === 'matched') {
      const applyResult = await applyWarning(
        row, result.member, panelLevel, issuedAt, expiresAt, expired, expiredAt, apply,
      );

      if (applyResult.duplicate) {
        skipped.push({
          csv_identity: row.identity,
          csv_level: row.levelRaw,
          csv_reason: row.reason,
          skip_reason: 'duplicate',
          detail: String(applyResult.warningId ?? ''),
        });
        continue;
      }

      matched.push({
        csv_identity: row.identity,
        csv_level: row.levelRaw,
        panel_level: panelLevel,
        csv_reason: row.reason,
        csv_start: row.startRaw,
        csv_end: row.endRaw,
        discord_id: result.member.discord_id,
        matched_username: result.member.username,
        match_method: result.method,
        expired,
        warning_id: applyResult.warningId ?? '',
        sheets_ok: applyResult.sheetsOk,
        sheets_error: applyResult.sheetsError ?? '',
      });
    } else if (result.status === 'ambiguous') {
      ambiguous.push({
        csv_identity: row.identity,
        csv_level: row.levelRaw,
        csv_reason: row.reason,
        match_name: result.name ?? '',
        match_method: result.method,
        candidates: candidateSummary(result.candidates),
      });
    } else {
      unmatched.push({
        csv_identity: row.identity,
        csv_level: row.levelRaw,
        csv_reason: row.reason,
        tried_names: identityResult.names.join(' | '),
        reason: result.reason ?? '',
      });
    }
  }

  const prefix = join(logDir, 'warning-import');
  writeReportCsv(`${prefix}-matched.csv`, [
    'csv_identity', 'csv_level', 'panel_level', 'csv_reason', 'csv_start', 'csv_end',
    'discord_id', 'matched_username', 'match_method', 'expired', 'warning_id', 'sheets_ok', 'sheets_error',
  ], matched);

  writeReportCsv(`${prefix}-unmatched.csv`, [
    'csv_identity', 'csv_level', 'csv_reason', 'tried_names', 'reason',
  ], unmatched);

  writeReportCsv(`${prefix}-ambiguous.csv`, [
    'csv_identity', 'csv_level', 'csv_reason', 'match_name', 'match_method', 'candidates',
  ], ambiguous);

  writeReportCsv(`${prefix}-skipped.csv`, [
    'csv_identity', 'csv_level', 'csv_reason', 'skip_reason', 'detail',
  ], skipped);

  const sheetsFailures = matched.filter(r => r.sheets_ok === false).length;

  console.log('Summary');
  console.log(`  Matched:    ${matched.length}`);
  console.log(`  Unmatched:  ${unmatched.length}`);
  console.log(`  Ambiguous:  ${ambiguous.length}`);
  console.log(`  Skipped:    ${skipped.length}`);
  if (apply) console.log(`  Sheets failures (DB still updated): ${sheetsFailures}`);
  console.log('');
  console.log(`Reports written to ${logDir}/`);
  console.log('  warning-import-matched.csv');
  console.log('  warning-import-unmatched.csv');
  console.log('  warning-import-ambiguous.csv');
  console.log('  warning-import-skipped.csv');

  if (!apply && matched.length) {
    console.log('\nRe-run with --apply to write changes.');
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
