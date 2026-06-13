import { Router } from 'express';
import { getDb } from '../db/client.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { executeWarningAction } from '../services/warnings.js';
import { appendWarning, updateWarningRow } from '../services/sheets.js';
import logger from '../logger.js';

const router = Router();

router.use(authMiddleware);

// GET /api/warnings?expired=false
router.get('/api/warnings', (req, res) => {
  const expired = req.query.expired === 'true' ? 1 : 0;
  const warnings = getDb()
    .prepare(`
      SELECT w.*, prev.level AS escalated_from_level
      FROM warnings w
      LEFT JOIN warnings prev ON w.escalated_from = prev.id
      WHERE w.expired = ?
      ORDER BY w.issued_at DESC
    `)
    .all(expired);
  res.json(warnings);
});

// GET /api/warnings/:id
router.get('/api/warnings/:id', (req, res) => {
  const warning = getDb()
    .prepare('SELECT * FROM warnings WHERE id = ?')
    .get(req.params.id);
  if (!warning) return res.status(404).json({ error: 'Warning not found' });
  res.json(warning);
});

// POST /api/warnings
router.post('/api/warnings', requireRole('mod'), async (req, res) => {
  const { discord_id, username, level, reason } = req.body;

  if (!discord_id || !username || !level || !reason) {
    return res.status(400).json({ error: 'discord_id, username, level and reason are required' });
  }

  const config = getDb()
    .prepare('SELECT * FROM warning_config WHERE level = ?')
    .get(level);

  if (!config) {
    return res.status(400).json({ error: `Warning level '${level}' is not configured` });
  }

  const result = getDb()
    .prepare(`
      INSERT INTO warnings (discord_id, username, level, reason, issued_by_id, issued_by_name)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(discord_id, username, level, reason, req.user.userId, req.user.username);

  const warning = getDb()
    .prepare('SELECT * FROM warnings WHERE id = ?')
    .get(result.lastInsertRowid);

  // execute actions and sync
  Promise.allSettled([
    executeWarningAction(warning, config),
    appendWarning(warning),
  ]).then(results => {
    results.forEach(r => {
      if (r.status === 'rejected') logger.error(`Warning post-action failed: ${r.reason}`);
    });
  });

  logger.info(`Warning L${level} issued to ${username} by ${req.user.username}`);
  res.status(201).json(warning);
});

// POST /api/warnings/:id/escalate
router.post('/api/warnings/:id/escalate', requireRole('mod'), async (req, res) => {
  const original = getDb()
    .prepare('SELECT * FROM warnings WHERE id = ?')
    .get(req.params.id);

  if (!original) return res.status(404).json({ error: 'Warning not found' });
  if (original.expired) return res.status(400).json({ error: 'Cannot escalate an expired warning' });

  const levelOrder = ['0', '1', '2A', '2B', '3', '4'];
  const currentIndex = levelOrder.indexOf(original.level);
  if (currentIndex === -1 || currentIndex === levelOrder.length - 1) {
    return res.status(400).json({ error: 'Warning is already at the maximum level' });
  }

  const nextLevel = levelOrder[currentIndex + 1];
  const config = getDb()
    .prepare('SELECT * FROM warning_config WHERE level = ?')
    .get(nextLevel);

  if (!config) {
    return res.status(400).json({ error: `Warning level '${nextLevel}' is not configured` });
  }

  getDb()
    .prepare(`UPDATE warnings SET expired = 1, expired_at = datetime('now') WHERE id = ?`)
    .run(original.id);

  const result = getDb()
    .prepare(`
      INSERT INTO warnings (discord_id, username, level, reason, issued_by_id, issued_by_name, escalated_from)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      original.discord_id,
      original.username,
      nextLevel,
      req.body.reason || original.reason,
      req.user.userId,
      req.user.username,
      original.id
    );

  const escalated = getDb()
    .prepare('SELECT * FROM warnings WHERE id = ?')
    .get(result.lastInsertRowid);

  Promise.allSettled([
    executeWarningAction(escalated, config),
    appendWarning(escalated),
    updateWarningRow({ ...original, expired: 1 }),
  ]).then(results => {
    results.forEach(r => {
      if (r.status === 'rejected') logger.error(`Escalation post-action failed: ${r.reason}`);
    });
  });

  logger.info(`Warning escalated from L${original.level} to L${nextLevel} for ${original.username}`);
  res.status(201).json(escalated);
});

// POST /api/warnings/:id/expire
router.post('/api/warnings/:id/expire', requireRole('mod'), async (req, res) => {
  const warning = getDb()
    .prepare('SELECT * FROM warnings WHERE id = ?')
    .get(req.params.id);

  if (!warning) return res.status(404).json({ error: 'Warning not found' });
  if (warning.expired) return res.status(400).json({ error: 'Warning is already expired' });

  getDb()
    .prepare(`UPDATE warnings SET expired = 1, expired_at = datetime('now') WHERE id = ?`)
    .run(warning.id);

  const updated = getDb()
    .prepare('SELECT * FROM warnings WHERE id = ?')
    .get(warning.id);

  updateWarningRow(updated).catch(err =>
    logger.error(`Failed to update Sheets after expire: ${err.message}`)
  );

  logger.info(`Warning ${warning.id} expired by ${req.user.username}`);
  res.json(updated);
});

// GET /api/warnings/member/:discordId
router.get('/api/warnings/member/:discordId', (req, res) => {
  const warnings = getDb()
    .prepare(`
      SELECT * FROM warnings
      WHERE discord_id = ?
      ORDER BY issued_at DESC
    `)
    .all(req.params.discordId);
  res.json(warnings);
});

export default router;