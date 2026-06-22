// File is copy-pasted, much appreciation to Codex and go blame Codex when it fails >:)
import { REST, Routes, ApplicationCommandPermissionType, PermissionFlagsBits } from 'discord.js';
import { readdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { backfillFromChannel } from '../../services/levels.js';
import { rehydrateScheduledUnbans, getPanelRoleIds } from '../../services/discord.js';
import logger from '../../logger.js';
import env from '../../config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function debugLog(hypothesisId, location, message, data = {}) {
  const entry = JSON.stringify({
    sessionId: 'e132f4',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  });
  // #region agent log
  fetch('http://127.0.0.1:7814/ingest/35e15fb8-c947-499b-97ca-e4d98636b86f', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e132f4' },
    body: entry,
  }).catch(() => {});
  try {
    appendFileSync(join(process.env.LOG_DIR || join(__dirname, '../../logs'), 'debug-e132f4.log'), `${entry}\n`);
  } catch { /* ignore */ }
  // #endregion
}

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

  const warnPayload = commandData.find(c => c.name === 'warn');
  debugLog('H1', 'ready.js:registerSlashCommands', 'warn registration payload', {
    default_member_permissions: warnPayload?.default_member_permissions ?? null,
    expected_moderate_members: String(PermissionFlagsBits.ModerateMembers),
    expected_administrator: String(PermissionFlagsBits.Administrator),
    is_zero: warnPayload?.default_member_permissions === '0',
  });
  debugLog('H4', 'ready.js:registerSlashCommands', 'panel mod role ids for warn', {
    modRoleIds: getPanelRoleIds('mod'),
    adminRoleIds: getPanelRoleIds('admin'),
    envModRole: env.discord.roles.mod ? 'set' : 'missing',
    envAdminRole: env.discord.roles.admin ? 'set' : 'missing',
  });

  const rest = new REST().setToken(env.discord.botToken);

  try {
    const registered = await rest.put(
      Routes.applicationGuildCommands(env.discord.clientId, env.discord.guildId),
      { body: commandData }
    );
    logger.info(`Registered ${commandData.length} slash command(s) with Discord`);
    const warnRegistered = registered.find(c => c.name === 'warn');
    debugLog('H1', 'ready.js:registerSlashCommands', 'warn discord response after PUT', {
      commandId: warnRegistered?.id ?? null,
      default_member_permissions: warnRegistered?.default_member_permissions ?? null,
    });
    await applyStaffCommandPermissions(rest, registered);
  } catch (err) {
    logger.error(`Failed to register slash commands: ${err.message}`);
  }
}

/** Restrict /syncmembers to admin panel roles. /warn uses ModerateMembers default only. */
async function applyStaffCommandPermissions(rest, registered) {
  const visibility = {
    syncmembers: getPanelRoleIds('admin'),
  };

  for (const cmd of registered) {
    const roleIds = visibility[cmd.name];
    if (!roleIds) {
      if (cmd.name === 'warn') {
        debugLog('H2', 'ready.js:applyStaffCommandPermissions', 'warn skips guild permission overwrites', {
          reason: 'uses default_member_permissions ModerateMembers only',
        });
      }
      continue;
    }

    if (!roleIds.length) {
      logger.warn(`No panel roles configured for /${cmd.name} — using default_member_permissions only`);
      continue;
    }

    // Deny @everyone, then allow each panel role (guild id === @everyone role id)
    const permissions = [
      {
        id: env.discord.guildId,
        type: ApplicationCommandPermissionType.Role,
        permission: false,
      },
      ...roleIds.map(id => ({
        id,
        type: ApplicationCommandPermissionType.Role,
        permission: true,
      })),
    ];

    try {
      await rest.put(
        Routes.applicationCommandPermissions(
          env.discord.clientId,
          env.discord.guildId,
          cmd.id
        ),
        { body: { permissions } }
      );
      logger.info(`Set /${cmd.name} visibility for ${roleIds.length} panel role(s)`);
      debugLog('H3', 'ready.js:applyStaffCommandPermissions', 'guild permission overwrites applied', {
        command: cmd.name,
        roleAllowCount: roleIds.length,
        deniesEveryone: true,
      });
    } catch (err) {
      logger.error(
        `Failed to set permissions for /${cmd.name}: ${err.message}` +
        (err.rawError?.message ? ` — ${err.rawError.message}` : '')
      );
      debugLog('H5', 'ready.js:applyStaffCommandPermissions', 'guild permission overwrites failed', {
        command: cmd.name,
        error: err.message,
        rawError: err.rawError?.message ?? null,
        code: err.code ?? null,
      });
    }
  }

  const warnCmd = registered.find(c => c.name === 'warn');
  if (warnCmd?.id) {
    try {
      const perms = await rest.get(
        Routes.applicationCommandPermissions(env.discord.clientId, env.discord.guildId, warnCmd.id)
      );
      debugLog('H2', 'ready.js:applyStaffCommandPermissions', 'warn final guild permissions from discord', {
        permissionCount: perms.permissions?.length ?? 0,
        permissions: (perms.permissions ?? []).map(p => ({ type: p.type, permission: p.permission })),
      });
    } catch (err) {
      debugLog('H5', 'ready.js:applyStaffCommandPermissions', 'failed to fetch warn permissions', {
        error: err.message,
      });
    }
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