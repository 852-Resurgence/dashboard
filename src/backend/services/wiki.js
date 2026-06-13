import axios from 'axios';
import logger from '../logger.js';
import env from '../config/env.js';

// persistent cookie jar
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

const jar = new CookieJar();
const client = wrapper(axios.create({
  baseURL: env.wiki.apiUrl,
  jar,
  withCredentials: true,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
}));

// ── Auth ──────────────────────────────────────────────────────

let loggedIn = false;

async function ensureLoggedIn() {
  if (loggedIn) return;

  const tokenRes = await client.get('', {
    params: { action: 'query', meta: 'tokens', type: 'login', format: 'json' },
  });
  const loginToken = tokenRes.data.query.tokens.logintoken;
  const loginRes = await client.post('', new URLSearchParams({
    action:     'login',
    lgname:     env.wiki.botUsername,
    lgpassword: env.wiki.botPassword,
    lgtoken:    loginToken,
    format:     'json',
  }));

  if (loginRes.data.login.result !== 'Success') {
    throw new Error(`MediaWiki login failed: ${loginRes.data.login.reason}`);
  }

  loggedIn = true;
  logger.info('MediaWiki bot logged in');
}

async function getCsrfToken() {
  const res = await client.get('', {
    params: { action: 'query', meta: 'tokens', format: 'json' },
  });
  return res.data.query.tokens.csrftoken;
}

// ── User management ───────────────────────────────────────────

export async function createUser({ username, password, email }) {
  await ensureLoggedIn();
  const token = await getCsrfToken();

  const res = await client.post('', new URLSearchParams({
    action:         'createaccount',
    username,
    password:       password || generatePassword(),
    retype:         password || '', // MediaWiki requires retype only when password is set
    email:          email || '',
    createtoken:    token,
    createreturnurl: env.wiki.apiUrl.replace('/api.php', ''),
    format:         'json',
  }));

  const result = res.data.createaccount;
  if (result.status !== 'PASS') {
    throw new Error(`Failed to create wiki user: ${JSON.stringify(result)}`);
  }

  logger.info(`Wiki user created: ${username}`);
  return result;
}

export async function setUserGroup({ username, addGroups = [], removeGroups = [] }) {
  await ensureLoggedIn();
  const token = await getCsrfToken();

  const res = await client.post('', new URLSearchParams({
    action: 'userrights',
    user:   username,
    add:    addGroups.join('|'),
    remove: removeGroups.join('|'),
    token,
    format: 'json',
  }));

  if (res.data.error) {
    throw new Error(`Failed to set user rights: ${res.data.error.info}`);
  }

  logger.info(`Wiki rights updated for ${username}: +[${addGroups}] -[${removeGroups}]`);
  return res.data.userrights;
}

// ── Logs ──────────────────────────────────────────────────────

export async function getRecentLogs({ limit = 50, type = '' } = {}) {
  await ensureLoggedIn();

  const params = {
    action:  'query',
    list:    'logevents',
    lelimit: limit,
    format:  'json',
  };
  if (type) params.letype = type;

  const res = await client.get('', { params });
  return (res.data.query?.logevents || []).map(e => ({
    ts:     e.timestamp,
    type:   e.type,
    action: e.action,
    user:   e.user,
    title:  e.title,
    comment: e.comment || '',
  }));
}

// let me generate some passwords for god sake i hate powershell

function generatePassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}