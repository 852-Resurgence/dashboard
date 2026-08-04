import { EmbedBuilder } from 'discord.js';
import { getDb } from '../db/client.js';
import {
  dmUser,
  tempBan,
  indefiniteBan,
  permanentBan,
  restrictChannels,
  postModLog,
} from './discord.js';
import logger from '../logger.js';

export function formatWarningDm(warning) {
  return `You have been given a (Level ${warning.level}) warning in 852 Resurgence for reason:\n${warning.reason}`;
}

export async function executeWarningAction(warning, config) {
  const db = getDb();

  db.prepare(`
    UPDATE members SET current_warning_id = ?
    WHERE discord_id = ?
  `).run(warning.id, warning.discord_id);

  const dmText = formatWarningDm(warning);
  await dmUser(warning.discord_id, dmText);
  logger.info(
    `Warning DM to ${warning.username} (${warning.discord_id}): Level ${warning.level} — ${warning.reason}`
  );

  if (config.post_mod_log) {
    const embed = new EmbedBuilder()
      .setColor(0xE24B4A)
      .setTitle(`Warning issued — Level ${warning.level}`)
      .addFields(
        { name: 'Member', value: `<@${warning.discord_id}>`, inline: true },
        { name: 'Level', value: String(warning.level), inline: true },
        { name: 'Reason', value: warning.reason },
        { name: 'Issued by', value: warning.issued_by_name, inline: true },
      )
      .setTimestamp(new Date(warning.issued_at));
    await postModLog(embed);
  }

  if (config.restrict_channels) {
    const channelIds = db
      .prepare('SELECT channel_id FROM restriction_channels')
      .all()
      .map(r => r.channel_id);

    if (channelIds.length) {
      await restrictChannels(warning.discord_id, channelIds);
      db.prepare(`
        UPDATE members SET active_restrictions = ?
        WHERE discord_id = ?
      `).run(JSON.stringify(channelIds), warning.discord_id);
    }
  }

  if (config.permanent_ban) {
    await permanentBan(warning.discord_id, `Level ${warning.level}: ${warning.reason}`);
  } else if (config.indefinite_ban) {
    await indefiniteBan(warning.discord_id, warning.username, warning.id);
  } else if (config.ban_duration_days) {
    await tempBan(
      warning.discord_id,
      warning.username,
      config.ban_duration_days,
      warning.id
    );
  }

  if (config.auto_expire_days) {
    const expiresAt = new Date(
      Date.now() + config.auto_expire_days * 24 * 60 * 60 * 1000
    ).toISOString();
    db.prepare(`
      UPDATE warnings SET expires_at = ? WHERE id = ?
    `).run(expiresAt, warning.id);
  }

  logger.info(`Warning actions executed for ${warning.username} (L${warning.level})`);
}
