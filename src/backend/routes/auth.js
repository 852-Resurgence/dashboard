import { Router } from 'express';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { resolvePermission } from '../services/discord.js';
import logger from '../logger.js';
import env from '../config/env.js';

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
    if (!role) {
      logger.warn(`Unauthorised login attempt by ${username} (${id})`);
      return res.redirect('/?error=unauthorised');
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
    res.redirect('/');
  } catch (err) {
    logger.error(`Auth callback error: ${err.message}`);
    res.redirect('/?error=auth_failed');
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
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const payload = jwt.verify(token, env.auth.jwtSecret);
    res.json({
      userId:   payload.userId,
      username: payload.username,
      role:     payload.role,
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
});

export default router;