import { upsertMemberFromGuildMember } from '../../services/memberCache.js';
import logger from '../../logger.js';

export default async function guildMemberUpdate(_oldMember, newMember) {
  const { displayName, username } = upsertMemberFromGuildMember(newMember);
  logger.debug(`Member updated: ${username} display "${displayName}" (${newMember.id})`);
}
