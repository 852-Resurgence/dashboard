import { Router } from 'express';
import { getDb } from '../db/client.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import logger from '../logger.js';

const router = Router();

router.use(authMiddleware);

// GET /api/members
router.get('/api/members', (req, res) => {
  const { search, rank } = req.query;

  let query = `
    SELECT
      m.*,
      ml.level                                    AS arcane_level,
      w.level                                     AS current_warning_level,
      GROUP_CONCAT(pw.level ORDER BY pw.issued_at) AS prior_warning_levels
    FROM members m
    LEFT JOIN member_levels ml ON m.discord_id = ml.discord_id
    LEFT JOIN warnings w  ON m.current_warning_id = w.id
    LEFT JOIN warnings pw ON pw.discord_id = m.discord_id
                          AND pw.expired = 1
    WHERE 1=1
  `;

  const params = [];

  if (search) {
    query += ` AND (m.username LIKE ? OR m.discord_id LIKE ? OR m.aliases LIKE ?)`;
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  if (rank) {
    query += ` AND m.rank = ?`;
    params.push(rank);
  }

  query += ` GROUP BY m.discord_id ORDER BY m.username COLLATE NOCASE ASC`;

  const members = getDb().prepare(query).all(...params);
  res.json(members);
});

// GET /api/members/:discordId
router.get('/api/members/:discordId', (req, res) => {
  const member = getDb()
    .prepare('SELECT * FROM members WHERE discord_id = ?')
    .get(req.params.discordId);
  if (!member) return res.status(404).json({ error: 'Member not found' });
  res.json(member);
});

// POST /api/members/sync
router.post('/api/members/sync', requireRole('admin'), async (req, res) => {
  // late import to prevent circular deps 
  const { runMemberSync } = await import('../jobs/weeklySync.js');

  try {
    res.json({ ok: true, message: 'Sync started' });
    const count = await runMemberSync();
    logger.info(`On-demand member sync complete — ${count} members`);
  } catch (err) {
    logger.error(`On-demand member sync failed: ${err.message}`);
  }
});

// GET /api/members/sync/status
router.get('/api/members/sync/status', (req, res) => {
  const latest = getDb()
    .prepare(`SELECT MAX(last_synced_at) AS last_synced_at FROM members`)
    .get();
  res.json({ last_synced_at: latest?.last_synced_at ?? null });
});

export default router;