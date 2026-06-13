import axios from 'axios';
import logger from '../logger.js';
import env from '../config/env.js';

const client = axios.create({
  baseURL: env.crafty.apiUrl,
  headers: { Authorization: `Bearer ${env.crafty.apiKey}` },
  timeout: 10000,
});

const SERVER = env.crafty.serverId;

// ── Server status ─────────────────────────────────────────────

export async function getServerStatus() {
  const res = await client.get(`/servers/${SERVER}/stats`);
  const s = res.data.data;
  return {
    online:    s.running,
    players:   s.online_players ?? 0,
    maxPlayers: s.max_players ?? 0,
    version:   s.version ?? '',
    uptime:    s.started ?? null,
  };
}

// ── Commands ──────────────────────────────────────────────────

export async function sendCommand(command) {
  await client.post(`/servers/${SERVER}/action`, {
    action: 'send_command',
    data: command,
  });
  logger.info(`Crafty command sent: ${command}`);
}

// ── SSE console stream ────────────────────────────────────────
// crafty exposes a WebSocket for live console output.
// Usage: attach(res) where res is an Express response object.
// The caller is responsible for setting SSE headers before calling.

import WebSocket from 'ws';

const subscribers = new Set();
let ws = null;
let reconnectTimer = null;

export function attachConsoleStream(res) {
  subscribers.add(res);
  res.on('close', () => subscribers.delete(res));
}

function broadcast(line) {
  for (const res of subscribers) {
    try {
      res.write(`data: ${JSON.stringify({ line })}\n\n`);
    } catch {
      subscribers.delete(res);
    }
  }
}

export function connectConsoleWS() {
  const wsUrl = env.crafty.apiUrl
    .replace(/^http/, 'ws')
    .replace('/api/v2', '') + `/ws?token=${env.crafty.apiKey}`;

  ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    logger.info('Crafty WebSocket connected');
    clearTimeout(reconnectTimer);
    ws.send(JSON.stringify({ action: 'logs', server_id: SERVER }));
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.event === 'console_output' && msg.data?.line) {
        broadcast(msg.data.line);
      }
    } catch { /* ignore malformed frames */ }
  });

  ws.on('close', () => {
    logger.warn('Crafty WebSocket closed — reconnecting in 5s');
    reconnectTimer = setTimeout(connectConsoleWS, 5000);
  });

  ws.on('error', (err) => {
    logger.error(`Crafty WebSocket error: ${err.message}`);
    ws.close();
  });
}