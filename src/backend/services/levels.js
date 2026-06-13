import { getDb } from '../db/client.js';
import logger from '../logger.js';
import env from '../config/env.js';

// ── Level parsing ─────────────────────────────────────────────

export function parseLevelUpMessage(content, authorId, authorUsername) {
  const match = content.match(env.arcane.levelUpRegex);
  if (!match) return null;

  const level = parseInt(match[1], 10);
  if (isNaN(level)) return null;

  return { discordId: authorId, username: authorUsername, level };
}

export function upsertLevel({ discordId, username, level }) {
  getDb()
    .prepare(`
      INSERT INTO member_levels (discord_id, username, level, seen_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(discord_id) DO UPDATE SET
        username = excluded.username,
        level    = excluded.level,
        seen_at  = excluded.seen_at
      WHERE excluded.level >= member_levels.level
    `)
    .run(discordId, username, level);

  logger.debug(`Level upserted: ${username} (${discordId}) → ${level}`);
}

export function getLevel(discordId) {
  return getDb()
    .prepare('SELECT level FROM member_levels WHERE discord_id = ?')
    .get(discordId)?.level ?? null;
}

// ── Rank derivation ───────────────────────────────────────────
// For manually assigned ranks (Staff, Luminary, Prestige) the rank
// is resolved from Discord roles in discord.js — see resolveRank().
// This function handles the levelled ranks only.

export function rankFromLevel(level) {
  if (level === null || level === undefined) return null;
  const t = env.rankThresholds;
  if (level >= t.vice.min)                              return 'vice';
  if (level >= t.senator.min && level <= t.senator.max) return 'senator';
  if (level >= t.dignitary.min && level <= t.dignitary.max) return 'dignitary';
  if (level >= t.attache.min  && level <= t.attache.max)    return 'attache';
  if (level >= t.citizen.min  && level <= t.citizen.max)    return 'citizen';
  return null;
}

// ── Backfill on bot startup ───────────────────────────────────
// Reads the last N messages from the level-up channel and seeds
// the member_levels table before going live.

export async function backfillFromChannel(channel, limit = 500) {
  logger.info(`Backfilling levels from #${channel.name} (last ${limit} messages)…`);

  let processed = 0;
  let lastId = null;
  let remaining = limit;

  while (remaining > 0) {
    const fetchCount = Math.min(remaining, 100);
    const options = { limit: fetchCount };
    if (lastId) options.before = lastId;

    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;

    for (const msg of messages.values()) {
      const parsed = parseLevelUpMessage(
        msg.content,
        msg.author.id,
        msg.author.username
      );
      if (parsed) {
        upsertLevel(parsed);
        processed++;
      }
    }

    lastId = messages.last()?.id;
    remaining -= messages.size;

    if (messages.size < fetchCount) break;
  }

  logger.info(`Level backfill complete — ${processed} entries upserted`);
}