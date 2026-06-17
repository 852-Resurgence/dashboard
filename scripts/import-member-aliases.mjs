#!/usr/bin/env node
/**
 * One-off import of legacy CSV aliases/notes into members DB + Google Sheets.
 *
 * Usage:
 *   node scripts/import-member-aliases.mjs <csvPath> [--apply] [--mapping overrides.json]
 *
 * Dry-run by default. Reports written to LOG_DIR (default /app/logs).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { initDb, getDb } from '../db/client.js';
import { updateMemberHumanFields } from '../services/sheets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CSV_RANK_TO_PANEL = {
  founder:   ['staff', 'luminary'],
  admin:     ['staff', 'luminary'],
  moderator: ['staff'],
  prestige:  ['prestige'],
  vice:      ['vice'],
  senator:   ['senator'],
  dignitary: ['dignitary'],
  attache:   ['attache'],
  citizen:   ['citizen'],
};

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
      console.log(`Usage: node scripts/import-member-aliases.mjs <csvPath> [--apply] [--mapping overrides.json]`);
      process.exit(0);
    } else positional.push(arg);
  }

  if (!positional[0]) {
    console.error('Error: CSV path required');
    process.exit(1);
  }

  return { csvPath: resolve(positional[0]), apply, mappingPath: mappingPath ? resolve(mappingPath) : null };
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

function parseCsv(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const rank = (fields[0] ?? '').trim();
    const name = (fields[1] ?? '').trim();
    const aliases = (fields[2] ?? '').trim();
    const notes = (fields[3] ?? '').trim();
    if (!name) continue;
    rows.push({ rank, name, aliases, notes });
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

function panelRankHints(csvRank) {
  const key = normalize(csvRank);
  return CSV_RANK_TO_PANEL[key] ?? null;
}

function filterByRank(members, csvRank) {
  const hints = panelRankHints(csvRank);
  if (!hints) return members;
  const filtered = members.filter(m => m.rank && hints.includes(m.rank));
  return filtered.length ? filtered : members;
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

// ── Indexes ───────────────────────────────────────────────────

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

// ── Matching ──────────────────────────────────────────────────

function matchRow(row, indexes) {
  const csvNameNorm = normalize(row.name);
  const csvAliasNorms = splitAliasTokens(row.aliases).map(normalize).filter(Boolean);

  const tiers = [
    {
      method: 'exact_username',
      candidates: () => lookup(indexes.byUsername, row.name),
    },
    {
      method: 'exact_display_name',
      candidates: () => lookup(indexes.byDisplayName, row.name),
    },
    {
      method: 'csv_name_in_member_aliases',
      candidates: () => lookup(indexes.byAliasToken, row.name),
    },
    {
      method: 'csv_alias_matches_member_identity',
      candidates: () => {
        const found = [];
        for (const aliasNorm of csvAliasNorms) {
          found.push(...lookup(indexes.byUsername, aliasNorm));
          found.push(...lookup(indexes.byDisplayName, aliasNorm));
        }
        return found;
      },
    },
    {
      method: 'fuzzy_username_with_rank',
      candidates: () => {
        if (!csvNameNorm) return [];
        const hints = panelRankHints(row.rank);
        const pool = hints
          ? uniqueByDiscordId([].concat(...[...indexes.byUsername.values()].flat())
            .filter(m => m.rank && hints.includes(m.rank)))
          : uniqueByDiscordId([].concat(...[...indexes.byUsername.values()].flat()));

        return pool.filter(m => {
          const u = normalize(m.username);
          if (!u) return false;
          return levenshtein(csvNameNorm, u) <= 2;
        });
      },
    },
  ];

  for (const tier of tiers) {
    let candidates = uniqueByDiscordId(tier.candidates());
    candidates = filterByRank(candidates, row.rank);
    const result = pickSingle(candidates, tier.method);
    if (result?.member) return { status: 'matched', ...result };
    if (result?.ambiguous) return { status: 'ambiguous', candidates: result.ambiguous, method: tier.method };
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

function resolveManual(row, mapping, byId) {
  const discordId = mapping.get(row.name) ?? mapping.get(normalize(row.name));
  if (!discordId) return null;
  const member = byId.get(discordId);
  if (!member) return { status: 'unmatched', reason: `mapping discord_id ${discordId} not in DB` };
  return { status: 'matched', member, method: 'manual_mapping' };
}

// ── Apply ─────────────────────────────────────────────────────

async function applyMatch(row, member, apply) {
  const aliases = row.aliases;
  const notes = row.notes;

  if (!apply) return { sheetsOk: null, dbOk: null };

  const db = getDb();
  db.prepare(`
    UPDATE members SET aliases = ?, notes = ? WHERE discord_id = ?
  `).run(aliases, notes, member.discord_id);

  let sheetsOk = true;
  let sheetsError = null;
  try {
    await updateMemberHumanFields(member.discord_id, aliases, notes);
  } catch (err) {
    sheetsOk = false;
    sheetsError = err.message;
    console.warn(`  Sheets skip ${member.discord_id} (${member.username}): ${err.message}`);
  }

  return { sheetsOk, dbOk: true, sheetsError };
}

function candidateSummary(members) {
  return members
    .map(m => `${m.discord_id}|${m.username}|${m.display_name ?? ''}|${m.rank ?? ''}`)
    .join('; ');
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const { csvPath, apply, mappingPath } = parseArgs(process.argv);
  const logDir = process.env.LOG_DIR || join(__dirname, '../logs');
  mkdirSync(logDir, { recursive: true });

  console.log(`CSV:     ${csvPath}`);
  console.log(`Mode:    ${apply ? 'APPLY (writes DB + Sheets)' : 'DRY RUN'}`);
  if (mappingPath) console.log(`Mapping: ${mappingPath}`);

  const csvContent = readFileSync(csvPath, 'utf8');
  const csvRows = parseCsv(csvContent);
  const mapping = loadMapping(mappingPath);

  initDb();
  const members = getDb().prepare('SELECT * FROM members').all();
  const indexes = buildIndexes(members);

  console.log(`Loaded ${csvRows.length} CSV rows, ${members.length} DB members\n`);

  const matched = [];
  const unmatched = [];
  const ambiguous = [];
  let skippedEmpty = 0;

  for (const row of csvRows) {
    if (!row.aliases && !row.notes) {
      skippedEmpty++;
      continue;
    }

    let result = resolveManual(row, mapping, indexes.byId);
    if (!result) result = matchRow(row, indexes);

    if (result.status === 'matched') {
      const applyResult = await applyMatch(row, result.member, apply);
      matched.push({
        csv_rank: row.rank,
        csv_name: row.name,
        csv_aliases: row.aliases,
        csv_notes: row.notes,
        discord_id: result.member.discord_id,
        matched_username: result.member.username,
        matched_display_name: result.member.display_name ?? '',
        matched_rank: result.member.rank ?? '',
        match_method: result.method,
        sheets_ok: applyResult.sheetsOk,
        sheets_error: applyResult.sheetsError ?? '',
      });
    } else if (result.status === 'ambiguous') {
      ambiguous.push({
        csv_rank: row.rank,
        csv_name: row.name,
        csv_aliases: row.aliases,
        csv_notes: row.notes,
        match_method: result.method,
        candidates: candidateSummary(result.candidates),
      });
    } else {
      unmatched.push({
        csv_rank: row.rank,
        csv_name: row.name,
        csv_aliases: row.aliases,
        csv_notes: row.notes,
        reason: result.reason ?? '',
      });
    }
  }

  const matchedPath = join(logDir, 'alias-import-matched.csv');
  const unmatchedPath = join(logDir, 'alias-import-unmatched.csv');
  const ambiguousPath = join(logDir, 'alias-import-ambiguous.csv');

  writeReportCsv(matchedPath, [
    'csv_rank', 'csv_name', 'csv_aliases', 'csv_notes',
    'discord_id', 'matched_username', 'matched_display_name', 'matched_rank',
    'match_method', 'sheets_ok', 'sheets_error',
  ], matched);

  writeReportCsv(unmatchedPath, [
    'csv_rank', 'csv_name', 'csv_aliases', 'csv_notes', 'reason',
  ], unmatched);

  writeReportCsv(ambiguousPath, [
    'csv_rank', 'csv_name', 'csv_aliases', 'csv_notes', 'match_method', 'candidates',
  ], ambiguous);

  const sheetsFailures = matched.filter(r => r.sheets_ok === false).length;

  console.log('Summary');
  console.log(`  Skipped (empty aliases+notes): ${skippedEmpty}`);
  console.log(`  Matched:                     ${matched.length}`);
  console.log(`  Unmatched:                   ${unmatched.length}`);
  console.log(`  Ambiguous:                   ${ambiguous.length}`);
  if (apply) console.log(`  Sheets failures (DB still updated): ${sheetsFailures}`);
  console.log('');
  console.log(`Reports written to ${logDir}/`);
  console.log(`  alias-import-matched.csv`);
  console.log(`  alias-import-unmatched.csv`);
  console.log(`  alias-import-ambiguous.csv`);

  if (!apply && matched.length) {
    console.log('\nRe-run with --apply to write changes.');
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
