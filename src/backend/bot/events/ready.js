// File is copy-pasted, much appreciation to Codex and go blame Codex when it fails >:)
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { backfillFromChannel } from '../../services/levels.js';
import { rehydrateScheduledUnbans } from '../../services/discord.js';
import logger from '../../logger.js';
import env from '../../config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// This event fires exactly once when the bot connects
export const once = true;

export default async function ready(client) {
  logger.info(`Bot ready — logged in as ${client.user.tag}`);

  await registerSlashCommands(client);
  await backfillLevels(client);
  rehydrateScheduledUnbans();
}

async function registerSlashCommands(client) {
  const commandsDir = join(__dirname, '../commands');
  const files = readdirSync(commandsDir).filter(f => f.endsWith('.js'));

  const commandData = [];
  for (const file of files) {
    const cmd = await import(join(commandsDir, file));
    if (cmd.data) commandData.push(cmd.data.toJSON());
  }

  const rest = new REST().setToken(env.discord.botToken);

  try {
    await rest.put(
      Routes.applicationGuildCommands(env.discord.clientId, env.discord.guildId),
      { body: commandData }
    );
    logger.info(`Registered ${commandData.length} slash command(s) with Discord`);
  } catch (err) {
    logger.error(`Failed to register slash commands: ${err.message}`);
  }
}

async function backfillLevels(client) {
  const channel = client.channels.cache.get(env.discord.channels.levelUp);
  if (!channel) {
    logger.warn(`Level-up channel not found (${env.discord.channels.levelUp}) — skipping backfill`);
    return;
  }
  await backfillFromChannel(channel, 500);
}