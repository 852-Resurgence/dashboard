import { parseLevelUpMessage, upsertLevel } from '../../services/levels.js';
import logger from '../../logger.js';
import env from '../../config/env.js';

export default async function messageCreate(message) {
  // Ignore bots other than Arcane, and DMs
  if (!message.guild) return;
  if (message.author.bot && message.channel.id !== env.discord.channels.levelUp) return;

  // Only process messages in the level-up channel
  if (message.channel.id !== env.discord.channels.levelUp) return;

  const mentionedUser = message.mentions.users.first();
  if (!mentionedUser) return;

  const parsed = parseLevelUpMessage(
    message.content,
    mentionedUser.id,
    mentionedUser.username
  );

  if (!parsed) return;

  upsertLevel(parsed);
  logger.info(`Level-up recorded: ${parsed.username} (${parsed.discordId}) → level ${parsed.level}`);
}