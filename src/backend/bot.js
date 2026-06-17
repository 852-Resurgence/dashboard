import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { setClient } from './services/discord.js';
import logger from './logger.js';
import env from './config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let client = null;
let readyAt = null;

export function getBotStatus() {
  return {
    online: client?.isReady() ?? false,
    uptime: readyAt ? Date.now() - readyAt : null,
    tag: client?.user?.tag ?? null,
  };
}

export async function startBot() {
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Message, Partials.Channel],
  });

  client.commands = new Collection();

  const commandsDir = join(__dirname, 'bot/commands');
  for (const file of readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
    const cmd = await import(pathToFileURL(join(commandsDir, file)).href);
    if (cmd.data?.name) {
      client.commands.set(cmd.data.name, cmd);
    }
  }

  const eventsDir = join(__dirname, 'bot/events');
  for (const file of readdirSync(eventsDir).filter(f => f.endsWith('.js'))) {
    const event = await import(pathToFileURL(join(eventsDir, file)).href);
    const handler = event.default;
    if (event.once) {
      client.once(event.name ?? file.replace('.js', ''), (...args) => {
        if (file === 'ready.js') readyAt = Date.now();
        return handler(...args, client);
      });
    } else {
      client.on(event.name ?? file.replace('.js', ''), (...args) => handler(...args, client));
    }
  }

  setClient(client);
  await client.login(env.discord.botToken);
  logger.info('Discord bot login initiated');
}
