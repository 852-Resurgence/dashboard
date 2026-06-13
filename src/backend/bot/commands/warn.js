import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getDb } from '../../db/client.js';
import { resolvePermission } from '../../services/discord.js';
import { appendWarning } from '../../services/sheets.js';
import { executeWarningAction } from '../../services/warnings.js';
import logger from '../../logger.js';

export const data = new SlashCommandBuilder()
  .setName('warn')
  .setDescription('Issue a warning to a member')
  .addUserOption(opt =>
    opt.setName('member').setDescription('The member to warn').setRequired(true)
  )
  .addIntegerOption(opt =>
    opt.setName('level').setDescription('Warning level').setRequired(true)
      .addChoices(
        { name: '0 — Informal warning',       value: '0' },
        { name: '1 — Formal warning',         value: '1' },
        { name: '2 - 14-day ban',             value: '2A'},
        { name: '3 - 30-day ban',             value: '2B'},
        { name: '3 — Indefinite ban',         value: '3' },
        { name: '4 — Permanent ban',          value: '4' },
      )
  )
  .addStringOption(opt =>
    opt.setName('reason').setDescription('Reason for the warning').setRequired(true)
  );

export async function execute(interaction) {
  // Permission check — mod or admin only
  const roleIds = [...interaction.member.roles.cache.keys()];
  const permission = resolvePermission(roleIds);
  if (!permission) {
    return interaction.reply({ content: 'You do not have permission to issue warnings.', ephemeral: true });
  }

  const target  = interaction.options.getUser('member');
  const level   = interaction.options.getString('level');
  const reason  = interaction.options.getString('reason');

  await interaction.deferReply({ ephemeral: true });

  // Fetch warning config for this level
  const config = getDb()
    .prepare('SELECT * FROM warning_config WHERE level = ?')
    .get(level);

  if (!config) {
    return interaction.editReply(`Warning level ${level} is not configured. Set it up in the dashboard first.`);
  }

  // Write to SQLite
  const result = getDb()
    .prepare(`
      INSERT INTO warnings (discord_id, username, level, reason, issued_by_id, issued_by_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(target.id, target.username, level, reason, interaction.user.id, interaction.user.username);

  const warning = getDb()
    .prepare('SELECT * FROM warnings WHERE id = ?')
    .get(result.lastInsertRowid);

  // Execute bot actions and sync to Sheets in parallel
  await Promise.allSettled([
    executeWarningAction(warning, config),
    appendWarning(warning),
  ]);

  logger.info(`Warning L${level} issued to ${target.username} by ${interaction.user.username} via slash command`);

  const embed = new EmbedBuilder()
    .setColor(0xE24B4A)
    .setTitle(`Warning issued — Level ${level}`)
    .addFields(
      { name: 'Member',  value: `<@${target.id}>`,          inline: true },
      { name: 'Level',   value: String(level),               inline: true },
      { name: 'Reason',  value: reason },
      { name: 'Issued by', value: `<@${interaction.user.id}>`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}