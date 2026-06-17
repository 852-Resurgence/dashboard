import { fetchMember } from '../../services/discord.js';
import { refreshMemberIdentityFromUser } from '../../services/memberCache.js';

export default async function userUpdate(_oldUser, newUser) {
  await refreshMemberIdentityFromUser(newUser, fetchMember);
}
