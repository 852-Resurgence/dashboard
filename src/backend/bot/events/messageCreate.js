import { parseLevelUpMessage, upsertLevel } from '../../services/levels.js';
import { getDb } from '../../db/client.js';
import logger from '../../logger.js';
import env from '../../config/env.js';

export default async function messageCreate(message) {
  if (!message.guild || !message.author || !message.member) return;

  // ── Arcane level-up parsing ───────────────────────────────────
  if (message.channel.id === env.discord.channels.levelUp && message.author.bot) {
    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) return;

    const parsed = parseLevelUpMessage(
      message.content,
      mentionedUser.id,
      mentionedUser.username
    );

    if (parsed) {
      upsertLevel(parsed);
      logger.info(`Level-up recorded: ${parsed.username} (${parsed.discordId}) -> level ${parsed.level}`);
    }
    return;
  }

  // ── Introduction validation ───────────────────────────────────
  if (message.channel.id === env.discord.channels.intro) {
    if (message.author.id === message.client.user?.id) return;

    const hasCitizen = message.member.roles.cache.has(env.ranks.citizen);

    if (message.content.length < 160) {
      await message.delete();
      const notice = await message.channel.send(
        `<@${message.author.id}>, your introduction must be at least 160 characters long.`
      );
      setTimeout(() => notice.delete().catch(() => {}), 15000);
      logger.info(
        `Rejected introduction from ${message.author.username} — too short (${message.content.length} chars)`
      );
      return;
    }

    const db = getDb();
    db.prepare(`
      UPDATE member_introductions SET is_current = 0
      WHERE discord_id = ? AND is_current = 1
    `).run(message.author.id);

    db.prepare(`
      INSERT INTO member_introductions (discord_id, username, content, submitted_at, is_current)
      VALUES (?, ?, ?, datetime('now'), 1)
    `).run(message.author.id, message.author.username, message.content);

    if (!hasCitizen) {
      await message.member.roles.add(env.ranks.citizen);
      logger.info(`Citizen role granted to ${message.author.username} (${message.author.id})`);
    } else {
      logger.info(`Re-introduction recorded for ${message.author.username} (${message.author.id})`);
    }
  }
}
