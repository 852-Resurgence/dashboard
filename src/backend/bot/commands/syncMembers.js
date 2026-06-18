import { SlashCommandBuilder } from 'discord.js';
import { resolvePermission } from '../../services/discord.js';
import { runMemberSync } from '../../jobs/weeklySync.js';
import logger from '../../logger.js';

export const data = new SlashCommandBuilder()
  .setName('syncmembers')
  .setDescription('Trigger an immediate member list sync to Google Sheets (admin only)')
  // Hidden from everyone by default; guild role permissions grant admin access on register
  .setDefaultMemberPermissions(0);

export async function execute(interaction) {
  const roleIds = [...interaction.member.roles.cache.keys()];
  const permission = resolvePermission(roleIds);

  if (permission !== 'admin') {
    return interaction.reply({ content: 'Only admins can trigger a member sync.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const count = await runMemberSync();
    logger.info(`Member sync triggered via slash command by ${interaction.user.username}`);
    await interaction.editReply(`✅ Sync complete — ${count} members written to Google Sheets.`);
  } catch (err) {
    logger.error(`Member sync failed: ${err.message}`);
    await interaction.editReply(`❌ Sync failed: ${err.message}`);
  }
}