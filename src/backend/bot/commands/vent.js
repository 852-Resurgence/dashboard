import {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('vent')
  .setDescription('Submit an anonymous vent for staff approval');

export async function execute(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('vent_modal')
    .setTitle('Anonymous vent');

  const contentInput = new TextInputBuilder()
    .setCustomId('vent_content')
    .setLabel('Your vent')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(10)
    .setMaxLength(2000)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(contentInput));
  await interaction.showModal(modal);
}
