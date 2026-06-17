import { getDb } from '../db/client.js';
import { fetchAllMembers, resolveRank, memberDisplayName } from '../services/discord.js';
import { getLevel } from '../services/levels.js';
import { syncMembers, getHumanColumns } from '../services/sheets.js';
import logger from '../logger.js';

let syncInProgress = false;

export async function runMemberSync() {
  if (syncInProgress) {
    throw new Error('A member sync is already in progress');
  }

  syncInProgress = true;
  try {
    const db = getDb();
    const guildMembers = await fetchAllMembers();
    const rows = [];

    for (const member of guildMembers.values()) {
      if (member.user.bot) continue;

      const roleIds = [...member.roles.cache.keys()];
      const rank = resolveRank(roleIds);
      const level = getLevel(member.id);

      const activeWarning = db.prepare(`
        SELECT level FROM warnings
        WHERE discord_id = ? AND expired = 0
        ORDER BY issued_at DESC LIMIT 1
      `).get(member.id);

      const priorWarnings = db.prepare(`
        SELECT level FROM warnings
        WHERE discord_id = ? AND expired = 1
        ORDER BY issued_at ASC
      `).all(member.id);

      const restrictions = db.prepare(`
        SELECT active_restrictions FROM members WHERE discord_id = ?
      `).get(member.id);

      db.prepare(`
        INSERT INTO members (
          discord_id, username, display_name, joined_at, rank, level, last_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(discord_id) DO UPDATE SET
          username       = excluded.username,
          display_name   = excluded.display_name,
          joined_at      = excluded.joined_at,
          rank           = excluded.rank,
          level          = excluded.level,
          last_synced_at = excluded.last_synced_at
      `).run(
        member.id,
        member.user.username,
        memberDisplayName(member),
        member.joinedAt?.toISOString() ?? null,
        rank,
        level
      );

      rows.push({
        discord_id: member.id,
        username: member.user.username,
        joined_at: member.joinedAt?.toISOString() ?? '',
        rank: rank ?? '',
        level: level ?? '',
        current_warning: activeWarning?.level ?? '',
        prior_warnings: priorWarnings.map(w => w.level).join(', '),
        active_restrictions: restrictions?.active_restrictions ?? '',
      });
    }

    const humanByDiscordId = await syncMembers(rows);

    for (const [discordId, human] of Object.entries(humanByDiscordId)) {
      db.prepare(`
        UPDATE members SET aliases = ?, notes = ? WHERE discord_id = ?
      `).run(human.aliases, human.notes, discordId);
    }

    const freshHuman = await getHumanColumns();
    for (const [discordId, human] of Object.entries(freshHuman)) {
      db.prepare(`
        UPDATE members SET aliases = ?, notes = ? WHERE discord_id = ?
      `).run(human.aliases, human.notes, discordId);
    }

    logger.info(`Member sync complete — ${rows.length} members processed`);
    return rows.length;
  } finally {
    syncInProgress = false;
  }
}

function msUntilNextSunday() {
  const now = new Date();
  const next = new Date(now);
  next.setDate(now.getDate() + ((7 - now.getDay()) % 7 || 7));
  next.setHours(3, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 7);
  return next.getTime() - now.getTime();
}

function scheduleNextWeeklySync() {
  const delay = msUntilNextSunday();
  logger.info(`Next weekly member sync scheduled in ${Math.round(delay / 3600000)}h`);
  setTimeout(async () => {
    try {
      await runMemberSync();
    } catch (err) {
      logger.error(`Weekly member sync failed: ${err.message}`);
    }
    scheduleNextWeeklySync();
  }, delay);
}

export function startWeeklySync() {
  scheduleNextWeeklySync();
}
