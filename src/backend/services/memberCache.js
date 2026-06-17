import { getDb } from '../db/client.js';
import { resolveRank, memberDisplayName } from './discord.js';
import { getLevel } from './levels.js';
import logger from '../logger.js';

/** Upsert core member fields from a live GuildMember (Discord.js). */
export function upsertMemberFromGuildMember(member) {
  const roleIds = [...member.roles.cache.keys()];
  const rank = resolveRank(roleIds);
  const level = getLevel(member.id);
  const username = member.user.username;
  const displayName = memberDisplayName(member);

  getDb()
    .prepare(`
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
    `)
    .run(
      member.id,
      username,
      displayName,
      member.joinedAt?.toISOString() ?? null,
      rank,
      level,
    );

  return { username, displayName, rank, level };
}

/** Update identity when only the User object changed (global name / username). */
export async function refreshMemberIdentityFromUser(user, fetchMember) {
  let displayName = user.globalName || user.username;
  try {
    const member = await fetchMember(user.id);
    displayName = memberDisplayName(member);
  } catch {
    /* not in guild or unreachable */
  }

  const result = getDb()
    .prepare(`
      UPDATE members
      SET username = ?, display_name = ?, last_synced_at = datetime('now')
      WHERE discord_id = ?
    `)
    .run(user.username, displayName, user.id);

  if (result.changes) {
    logger.debug(`Member identity refreshed: ${user.username} → display "${displayName}" (${user.id})`);
  }
}
