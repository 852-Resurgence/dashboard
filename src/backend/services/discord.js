import { getDb } from '../db/client.js';
import logger from '../logger.js';
import env from '../config/env.js';

let _client = null;

export function setClient(client) {
  _client = client;
}

function guild() {
  const g = _client?.guilds.cache.get(env.discord.guildId);
  if (!g) throw new Error('Guild not found — is the bot in the server?');
  return g;
}

// ── Member actions ────────────────────────────────────────────

export async function fetchMember(discordId) {
  return guild().members.fetch(discordId);
}

export async function fetchAllMembers() {
  const g = guild();
  // Force refresh so globalName / nicknames are current (stale cache left display_name empty)
  await g.members.fetch({ force: true });
  return g.members.cache;
}

export async function dmUser(discordId, message) {
  try {
    const member = await fetchMember(discordId);
    await member.send(message);
    logger.info(`DM sent to ${member.user.username} (${discordId})`);
  } catch (err) {
    logger.warn(`Could not DM ${discordId}: ${err.message}`);
  }
}

// ── Bans ─────────────────────────────────────────────────────

export async function tempBan(discordId, username, durationDays, warningId) {
  const g = guild();
  await g.members.ban(discordId, { reason: `Warning issued — ${durationDays}-day ban` });
  logger.info(`Temp banned ${username} (${discordId}) for ${durationDays} day(s)`);

  const unbanAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
  getDb()
    .prepare(`
      INSERT INTO scheduled_unbans (discord_id, username, unban_at, warning_id)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(discord_id) DO UPDATE SET unban_at = excluded.unban_at
    `)
    .run(discordId, username, unbanAt, warningId);

  scheduleUnban(discordId, username, unbanAt);
}

// L3
export async function indefiniteBan(discordId, username, warningId) {
  const g = guild();
  await g.members.ban(discordId, { reason: 'Level 3 warning — indefinite ban, appealable after 6 months' });
  logger.info(`Indefinite ban applied to ${username} (${discordId})`);

  const eligibleAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
  getDb()
    .prepare(`
      INSERT INTO appeals (warning_id, discord_id, username, eligible_at)
      VALUES (?, ?, ?, ?)
    `)
    .run(warningId, discordId, username, eligibleAt);
}

export async function permanentBan(discordId, reason) {
  await guild().members.ban(discordId, { reason });
  logger.info(`Permanently banned ${discordId}: ${reason}`);
}

export async function unban(discordId) {
  try {
    await guild().members.unban(discordId);
    getDb().prepare('DELETE FROM scheduled_unbans WHERE discord_id = ?').run(discordId);
    logger.info(`Unbanned ${discordId}`);
  } catch (err) {
    logger.warn(`Could not unban ${discordId}: ${err.message}`);
  }
}

// Called on bot ready to reinstate any unbans that elapsed while offline
export function rehydrateScheduledUnbans() {
  const pending = getDb()
    .prepare('SELECT * FROM scheduled_unbans')
    .all();

  for (const row of pending) {
    scheduleUnban(row.discord_id, row.username, row.unban_at);
  }

  if (pending.length > 0) {
    logger.info(`Rehydrated ${pending.length} scheduled unban(s)`);
  }
}

function scheduleUnban(discordId, username, unbanAt) {
  const msUntilUnban = new Date(unbanAt).getTime() - Date.now();
  if (msUntilUnban <= 0) {
    unban(discordId);
    return;
  }
  setTimeout(() => unban(discordId), msUntilUnban);
  logger.debug(`Unban scheduled for ${username} (${discordId}) in ${Math.round(msUntilUnban / 60000)}m`);
}

// ── Channel permission restrictions ──────────────────────────

export async function restrictChannels(discordId, channelIds) {
  const member = await fetchMember(discordId);
  const g = guild();

  for (const channelId of channelIds) {
    const channel = g.channels.cache.get(channelId);
    if (!channel) {
      logger.warn(`Restriction channel not found: ${channelId}`);
      continue;
    }
    await channel.permissionOverwrites.edit(member, {
      ViewChannel: false,
      SendMessages: false,
    });
    logger.info(`Restricted ${member.user.username} from #${channel.name}`);
  }
}

export async function liftChannelRestrictions(discordId, channelIds) {
  const member = await fetchMember(discordId);
  const g = guild();

  for (const channelId of channelIds) {
    const channel = g.channels.cache.get(channelId);
    if (!channel) continue;
    await channel.permissionOverwrites.delete(member);
    logger.info(`Lifted restrictions on ${member.user.username} from #${channel.name}`);
  }
}

// ── Mod log ───────────────────────────────────────────────────

export async function postModLog(embed) {
  const channel = _client?.channels.cache.get(env.discord.channels.modLog);
  if (!channel) {
    logger.warn('Mod log channel not found');
    return;
  }
  await channel.send({ embeds: [embed] });
}

// ── Role resolution ───────────────────────────────────────────

// Returns the permission level for a given set of Discord role IDs
export function resolvePermission(roleIds) {
  if (roleIds.includes(env.discord.roles.admin)) return 'admin';
  if (roleIds.includes(env.discord.roles.mod))   return 'mod';

  // Also honour role mappings configured via the panel setup UI
  try {
    const rows = getDb().prepare('SELECT role_id, permission FROM role_permissions').all();
    let modMatch = null;
    for (const row of rows) {
      if (!roleIds.includes(row.role_id)) continue;
      if (row.permission === 'admin') return 'admin';
      if (row.permission === 'mod') modMatch = 'mod';
    }
    return modMatch;
  } catch {
    return null;
  }
}

/** Discord role IDs allowed to see/use staff slash commands (matches resolvePermission). */
export function getPanelRoleIds(minimumRole = 'mod') {
  const ids = new Set();
  if (env.discord.roles.admin) ids.add(env.discord.roles.admin);
  if (minimumRole === 'mod' && env.discord.roles.mod) ids.add(env.discord.roles.mod);

  try {
    const rows = getDb().prepare('SELECT role_id, permission FROM role_permissions').all();
    for (const row of rows) {
      if (row.permission === 'admin') ids.add(row.role_id);
      else if (minimumRole === 'mod' && row.permission === 'mod') ids.add(row.role_id);
    }
  } catch {
    /* DB may not be ready during early startup */
  }

  return [...ids];
}

// Returns the rank name for a given set of Discord role IDs
export function resolveRank(roleIds) {
  const rankMap = [
    ['staff',     env.ranks.staff],
    ['luminary',  env.ranks.luminary],
    ['prestige',  env.ranks.prestige],
    ['vice',      env.ranks.vice],
    ['senator',   env.ranks.senator],
    ['dignitary', env.ranks.dignitary],
    ['attache',   env.ranks.attache],
    ['citizen',   env.ranks.citizen],
  ];
  for (const [name, id] of rankMap) {
    if (roleIds.includes(id)) return name;
  }
  return null;
}

/** Server nickname, else Discord global display name, else @username handle. */
export function memberDisplayName(member) {
  if (!member?.user) return '';
  return (member.displayName || member.user.globalName || member.user.username).trim();
}