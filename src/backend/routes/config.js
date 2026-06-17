import { Router } from 'express';
import { getDb } from '../db/client.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import logger from '../logger.js';
import env from '../config/env.js';

const router = Router();

router.use(authMiddleware);

router.get('/api/config/warning-levels', (req, res) => {
  const levels = getDb()
    .prepare('SELECT * FROM warning_config ORDER BY level')
    .all();
  res.json(levels);
});

router.post('/api/config/warning-levels', requireRole('admin'), (req, res) => {
  const {
    level, name, description,
    send_dm = 1, post_mod_log = 0, restrict_channels = 0,
    ban_duration_days = null, indefinite_ban = 0, permanent_ban = 0,
    appeal_after_days = null, auto_expire_days = null,
  } = req.body;

  if (!level || !name || !description) {
    return res.status(400).json({ error: 'level, name and description are required' });
  }

  try {
    getDb().prepare(`
      INSERT INTO warning_config (
        level, name, description, send_dm, post_mod_log, restrict_channels,
        ban_duration_days, indefinite_ban, permanent_ban, appeal_after_days, auto_expire_days
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      level, name, description, send_dm, post_mod_log, restrict_channels,
      ban_duration_days, indefinite_ban, permanent_ban, appeal_after_days, auto_expire_days
    );
    const created = getDb().prepare('SELECT * FROM warning_config WHERE level = ?').get(level);
    logger.info(`Warning level ${level} created by ${req.user.username}`);
    res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: `Warning level '${level}' already exists` });
    }
    throw err;
  }
});

router.put('/api/config/warning-levels/:level', requireRole('admin'), (req, res) => {
  const { level } = req.params;
  const existing = getDb().prepare('SELECT * FROM warning_config WHERE level = ?').get(level);
  if (!existing) return res.status(404).json({ error: 'Warning level not found' });

  const {
    name, description,
    send_dm, post_mod_log, restrict_channels,
    ban_duration_days, indefinite_ban, permanent_ban,
    appeal_after_days, auto_expire_days,
  } = req.body;

  getDb().prepare(`
    UPDATE warning_config SET
      name = ?, description = ?, send_dm = ?, post_mod_log = ?,
      restrict_channels = ?, ban_duration_days = ?, indefinite_ban = ?,
      permanent_ban = ?, appeal_after_days = ?, auto_expire_days = ?,
      updated_at = datetime('now')
    WHERE level = ?
  `).run(
    name ?? existing.name,
    description ?? existing.description,
    send_dm ?? existing.send_dm,
    post_mod_log ?? existing.post_mod_log,
    restrict_channels ?? existing.restrict_channels,
    ban_duration_days ?? existing.ban_duration_days,
    indefinite_ban ?? existing.indefinite_ban,
    permanent_ban ?? existing.permanent_ban,
    appeal_after_days ?? existing.appeal_after_days,
    auto_expire_days ?? existing.auto_expire_days,
    level
  );

  const updated = getDb().prepare('SELECT * FROM warning_config WHERE level = ?').get(level);
  logger.info(`Warning level ${level} updated by ${req.user.username}`);
  res.json(updated);
});

router.delete('/api/config/warning-levels/:level', requireRole('admin'), (req, res) => {
  const { level } = req.params;
  const existing = getDb().prepare('SELECT * FROM warning_config WHERE level = ?').get(level);
  if (!existing) return res.status(404).json({ error: 'Warning level not found' });

  getDb().prepare('DELETE FROM warning_config WHERE level = ?').run(level);
  logger.info(`Warning level ${level} deleted by ${req.user.username}`);
  res.json({ ok: true });
});

router.get('/api/config/restriction-channels', (req, res) => {
  const channels = getDb()
    .prepare('SELECT * FROM restriction_channels ORDER BY channel_name')
    .all();
  res.json(channels);
});

router.post('/api/config/restriction-channels', requireRole('admin'), (req, res) => {
  const { channel_id, channel_name } = req.body;
  if (!channel_id || !channel_name) {
    return res.status(400).json({ error: 'channel_id and channel_name are required' });
  }

  try {
    getDb().prepare(`
      INSERT INTO restriction_channels (channel_id, channel_name) VALUES (?, ?)
    `).run(channel_id, channel_name);
    logger.info(`Restriction channel added: #${channel_name} by ${req.user.username}`);
    res.status(201).json({ channel_id, channel_name });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Channel already in restriction list' });
    }
    throw err;
  }
});

router.delete('/api/config/restriction-channels/:channelId', requireRole('admin'), (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM restriction_channels WHERE channel_id = ?')
    .run(req.params.channelId);
  if (!result.changes) return res.status(404).json({ error: 'Channel not found' });
  logger.info(`Restriction channel removed: ${req.params.channelId} by ${req.user.username}`);
  res.json({ ok: true });
});

router.get('/api/config/roles', (req, res) => {
  const roles = getDb()
    .prepare('SELECT * FROM role_permissions ORDER BY permission DESC, role_name')
    .all();
  res.json(roles);
});

router.post('/api/config/roles', requireRole('admin'), (req, res) => {
  const { role_id, role_name, permission } = req.body;
  if (!role_id || !role_name || !permission) {
    return res.status(400).json({ error: 'role_id, role_name and permission are required' });
  }
  if (!['admin', 'mod'].includes(permission)) {
    return res.status(400).json({ error: "permission must be 'admin' or 'mod'" });
  }

  try {
    getDb().prepare(`
      INSERT INTO role_permissions (role_id, role_name, permission) VALUES (?, ?, ?)
    `).run(role_id, role_name, permission);
    logger.info(`Role ${role_name} mapped to ${permission} by ${req.user.username}`);
    res.status(201).json({ role_id, role_name, permission });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Role already mapped' });
    }
    throw err;
  }
});

router.delete('/api/config/roles/:roleId', requireRole('admin'), (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM role_permissions WHERE role_id = ?')
    .run(req.params.roleId);
  if (!result.changes) return res.status(404).json({ error: 'Role not found' });
  logger.info(`Role mapping removed: ${req.params.roleId} by ${req.user.username}`);
  res.json({ ok: true });
});

router.get('/api/config/sheets-urls', (req, res) => {
  res.json({
    warnings: env.sheets.warningsUrl,
    members:  env.sheets.membersUrl,
  });
});

router.get('/api/config/setup-status', (req, res) => {
  const db = getDb();
  const warningLevels = db.prepare('SELECT COUNT(*) as count FROM warning_config').get().count;
  const rolesMapped   = db.prepare('SELECT COUNT(*) as count FROM role_permissions').get().count;
  const channelsSet   = db.prepare('SELECT COUNT(*) as count FROM restriction_channels').get().count;

  res.json({
    complete:      warningLevels > 0 && rolesMapped > 0,
    warningLevels,
    rolesMapped,
    channelsSet,
  });
});

export default router;