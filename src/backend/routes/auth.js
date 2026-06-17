import { Router } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { getDb } from '../db/client.js';
import { resolvePermission } from '../services/discord.js';
import logger from '../logger.js';
import env from '../config/env.js';
import { debugLog } from '../debugLog.js';

const router = Router();

const DISCORD_AUTH_URL = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_API_URL = 'https://discord.com/api/v10';

// redirect
router.get('/auth/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id:     env.discord.clientId,
    redirect_uri:  env.discord.redirectUri,
    response_type: 'code',
    scope:         'identify guilds.members.read',
  });
  res.redirect(`${DISCORD_AUTH_URL}?${params}`);
});

// redirect back with code
router.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  // #region agent log
  debugLog('auth.js:callback:entry', 'OAuth callback hit', {
    hasCode: !!code,
    redirectUri: env.discord.redirectUri,
    cookieDomain: env.auth.cookieDomain,
    nodeEnv: env.nodeEnv,
  }, 'H1');
  // #endregion
  if (!code) return res.status(400).json({ error: 'Missing code' });

  try {
    // exchange token
    const tokenRes = await axios.post(DISCORD_TOKEN_URL,
      new URLSearchParams({
        client_id:     env.discord.clientId,
        client_secret: env.discord.clientSecret,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  env.discord.redirectUri,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = tokenRes.data;

    // fetch user
    const userRes = await axios.get(`${DISCORD_API_URL}/users/@me`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const { id, username } = userRes.data;

    // fetch members
    const memberRes = await axios.get(
      `${DISCORD_API_URL}/users/@me/guilds/${env.discord.guildId}/member`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const roleIds = memberRes.data.roles ?? [];

    // resolve permission level
    const role = resolvePermission(roleIds);
    // #region agent log
    debugLog('auth.js:callback:roles', 'Discord roles resolved', {
      roleCount: roleIds.length,
      resolvedRole: role ?? null,
      adminRoleConfigured: !!env.discord.roles.admin,
      modRoleConfigured: !!env.discord.roles.mod,
      dbRoleMappings: getDb().prepare('SELECT COUNT(*) AS n FROM role_permissions').get().n,
    }, 'H1');
    // #endregion
    if (!role) {
      logger.warn(`Unauthorised login attempt by ${username} (${id})`);
      // #region agent log
      debugLog('auth.js:callback:denied', 'No matching admin/mod role', { username }, 'H1');
      // #endregion
      return res.redirect('/login?error=unauthorised');
    }

    const token = jwt.sign(
      { userId: id, username, role },
      env.auth.jwtSecret,
      { expiresIn: env.auth.jwtExpiry }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure:   env.nodeEnv === 'production',
      sameSite: 'lax',
      domain:   env.auth.cookieDomain,
      maxAge:   8 * 60 * 60 * 1000, 
    });

    logger.info(`${username} (${id}) logged in as ${role}`);
    // #region agent log
    debugLog('auth.js:callback:success', 'Cookie set, redirecting to /', {
      role,
      secureCookie: env.nodeEnv === 'production',
      cookieDomain: env.auth.cookieDomain,
    }, 'H2');
    // #endregion
    res.redirect('/');
  } catch (err) {
    logger.error(`Auth callback error: ${err.message}`);
    // #region agent log
    debugLog('auth.js:callback:error', 'OAuth callback failed', {
      error: err.message,
      status: err.response?.status ?? null,
    }, 'H1');
    // #endregion
    res.redirect('/login?error=auth_failed');
  }
});

// sign out
router.post('/auth/logout', (req, res) => {
  res.clearCookie('token', {
    domain: env.auth.cookieDomain,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
  });
  res.json({ ok: true });
});

// frontend validity endpoint
router.get('/auth/me', (req, res) => {
  const token = req.cookies?.token;
  // #region agent log
  debugLog('auth.js:me', '/auth/me request', {
    hasToken: !!token,
    cookieKeys: Object.keys(req.cookies ?? {}),
  }, 'H3');
  // #endregion
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const payload = jwt.verify(token, env.auth.jwtSecret);
    // #region agent log
    debugLog('auth.js:me:ok', 'JWT verified', { role: payload.role }, 'H3');
    // #endregion
    res.json({
      userId:   payload.userId,
      username: payload.username,
      role:     payload.role,
    });
  } catch (err) {
    // #region agent log
    debugLog('auth.js:me:fail', 'JWT verify failed', { error: err.message }, 'H3');
    // #endregion
    res.status(401).json({ error: 'Invalid or expired session' });
  }
});

// Client-side debug reports (no secrets)
router.post('/auth/debug-client', (req, res) => {
  const { location, message, data, hypothesisId } = req.body ?? {};
  debugLog(location || 'client', message || 'client report', data || {}, hypothesisId || 'H5');
  res.json({ ok: true });
});

export default router;