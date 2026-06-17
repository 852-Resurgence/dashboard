import { resolveRank, dmUser } from '../../services/discord.js';
import { upsertMemberFromGuildMember } from '../../services/memberCache.js';
import logger from '../../logger.js';

export default async function guildMemberAdd(member) {
  upsertMemberFromGuildMember(member);

  await dmUser(
    member.id,
    'Welcome to **852 Resurgence**! Please read the server rules and post your introduction in the introductions channel (minimum 160 characters) to receive the Citizen role.'
  );

  logger.info(`New member joined and cached: ${member.displayName ?? member.user.username} (${member.id})`);
}
