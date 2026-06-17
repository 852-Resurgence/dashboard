import { getDb } from '../../db/client.js';
import { resolveRank, dmUser } from '../../services/discord.js';
import { getLevel } from '../../services/levels.js';
import logger from '../../logger.js';

export default async function guildMemberAdd(member) {
  const roleIds = [...member.roles.cache.keys()];
  const rank = resolveRank(roleIds);
  const level = getLevel(member.id);

  getDb()
    .prepare(`
      INSERT INTO members (discord_id, username, joined_at, rank, level, last_synced_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(discord_id) DO UPDATE SET
        username       = excluded.username,
        joined_at      = excluded.joined_at,
        rank           = excluded.rank,
        level          = excluded.level,
        last_synced_at = excluded.last_synced_at
    `)
    .run(
      member.id,
      member.user.username,
      member.joinedAt?.toISOString() ?? null,
      rank,
      level
    );

  await dmUser(
    member.id,
    'Welcome to **852 Resurgence**! Please read the server rules and post your introduction in the introductions channel (minimum 160 characters) to receive the Citizen role.'
  );

  logger.info(`New member joined and cached: ${member.user.username} (${member.id})`);
}