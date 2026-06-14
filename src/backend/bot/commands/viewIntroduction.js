import { ContextMenuCommandBuilder, ApplicationCommandType, MessageFlags } from 'discord.js';
import { getDb } from '../../db/client.js';
import logger from '../../logger.js';

export const data = new ContextMenuCommandBuilder()
  .setName('View Introduction')
  .setType(ApplicationCommandType.User);

export async function execute(interaction) {
  if (!interaction.isUserContextMenuCommand()) return;

  const targetUser = interaction.targetUser;

  const intro = getDb()
    .prepare(`
      SELECT content, submitted_at FROM member_introductions
      WHERE discord_id = ? AND is_current = 1
    `)
    .get(targetUser.id);

  if (!intro) {
    return interaction.reply({
      content: `No introduction found for ${targetUser.username}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const date = new Date(intro.submitted_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  await interaction.reply({
    content: `**Introduction by ${targetUser.username}** _(submitted ${date})_\n\n${intro.content}`,
    flags: MessageFlags.Ephemeral,
  });

  logger.debug(`View Introduction used by ${interaction.user.username} for ${targetUser.username}`);
}