import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import logger from '../../logger.js';
import env from '../../config/env.js';

export default async function interactionCreate(interaction, client) {

  // ── Slash commands and context menus ─────────────────────────
  if (interaction.isChatInputCommand() || interaction.isUserContextMenuCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      logger.warn(`Unknown command received: ${interaction.commandName}`);
      return;
    }
    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error(`Error executing /${interaction.commandName}: ${err.message}`);
      const reply = { content: 'Something went wrong executing that command.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
    return;
  }

  // ── Modal submissions ─────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'vent_modal') {
      await handleVentSubmit(interaction);
    }
    return;
  }

  // ── Button / component interactions ──────────────────────────
  if (interaction.isMessageComponent()) {
    if (interaction.customId.startsWith('vent_approve:')) {
      await handleVentApprove(interaction);
    } else if (interaction.customId.startsWith('vent_deny:')) {
      await handleVentDeny(interaction);
    }
    return;
  }
}

// ── Vent handlers ─────────────────────────────────────────────

async function handleVentSubmit(interaction) {
  const ventContent = interaction.fields.getTextInputValue('vent_content');

  const ventId = randomUUID();
  getDb()
    .prepare('INSERT INTO pending_vents (id, discord_id) VALUES (?, ?)')
    .run(ventId, interaction.user.id);

  const approvalChannel = await interaction.client.channels.fetch(env.discord.channels.ventApproval);
  if (approvalChannel?.isSendable()) {
    const approveButton = new ButtonBuilder()
      .setCustomId(`vent_approve:${ventId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success);

    const denyButton = new ButtonBuilder()
      .setCustomId(`vent_deny:${ventId}`)
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger);

    await approvalChannel.send({
      content: `_A new anonymous vent is awaiting approval._\n\`\`\`\n${ventContent}\n\`\`\``,
      components: [new ActionRowBuilder().addComponents(approveButton, denyButton)],
    });
  }

  await interaction.reply({
    content: 'Your vent has been submitted and is awaiting staff approval.',
    flags: MessageFlags.Ephemeral,
  });

  logger.info(`Anonymous vent submitted (id: ${ventId})`);
}

async function handleVentApprove(interaction) {
  const ventId = interaction.customId.split(':')[1];
  const ventContent = interaction.message.content.split('```')[1].trim();

  const pending = getDb()
    .prepare('SELECT discord_id FROM pending_vents WHERE id = ?')
    .get(ventId);

  // Post to the public vents channel
  const postsChannel = await interaction.client.channels.fetch(env.discord.channels.ventPosts);
  if (postsChannel?.isSendable()) {
    await postsChannel.send({
      content: `>>> ${ventContent}\n-# _This is a venting text submitted anonymously by an 852 Resurgence member. Submit your own anonymous vent using the /vent command._`,
    });
  }

  if (pending) {
    try {
      const submitter = await interaction.client.users.fetch(pending.discord_id);
      await submitter.send('Your anonymous vent has been approved and posted.');
    } catch {
    }
    getDb().prepare('DELETE FROM pending_vents WHERE id = ?').run(ventId);
  }

  await interaction.update({
    content: `_This anonymous vent was approved by ${interaction.user.username}._`,
    components: [],
  });

  logger.info(`Anonymous vent approved by ${interaction.user.username} (id: ${ventId})`);
}

async function handleVentDeny(interaction) {
  const ventId = interaction.customId.split(':')[1];

  const pending = getDb()
    .prepare('SELECT discord_id FROM pending_vents WHERE id = ?')
    .get(ventId);

  if (pending) {
    try {
      const submitter = await interaction.client.users.fetch(pending.discord_id);
      await submitter.send(
        'Your anonymous vent was reviewed by staff and was not approved for posting. ' +
        'If you have questions, please contact a staff member.'
      );
    } catch {
    }
    getDb().prepare('DELETE FROM pending_vents WHERE id = ?').run(ventId);
  }

  await interaction.update({
    content: `_This anonymous vent was denied by ${interaction.user.username}._`,
    components: [],
  });

  logger.info(`Anonymous vent denied by ${interaction.user.username} (id: ${ventId})`);
}