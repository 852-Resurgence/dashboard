import { Router } from 'express';
import { getDb } from '../db/client.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import logger from '../logger.js';

const router = Router();

const RANK_ORDER = [
  'staff', 'luminary', 'prestige', 'vice',
  'senator', 'dignitary', 'attache', 'citizen',
];

const RANK_SORT_SQL = RANK_ORDER
  .map((rank, i) => `WHEN '${rank}' THEN ${i + 1}`)
  .join(' ');

/** Always listed first regardless of rank. */
const PINNED_MEMBER_ID = '319761776659136524';

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
    query += ` AND (
      m.username LIKE ? OR m.display_name LIKE ? OR m.discord_id LIKE ?
      OR m.aliases LIKE ? OR m.notes LIKE ?
    )`;
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }

  if (rank) {
    query += ` AND m.rank = ?`;
    params.push(rank);
  }

  query += `
    GROUP BY m.discord_id
    ORDER BY CASE WHEN m.discord_id = '${PINNED_MEMBER_ID}' THEN 0 ELSE 1 END ASC,
             CASE m.rank ${RANK_SORT_SQL} ELSE 99 END ASC,
             COALESCE(m.display_name, m.username) COLLATE NOCASE ASC
  `;

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

// PATCH /api/members/:discordId — update aliases and notes (panel + Sheets)
router.patch('/api/members/:discordId', requireRole('mod'), async (req, res) => {
  const { discordId } = req.params;
  const db = getDb();

  const member = db.prepare('SELECT discord_id FROM members WHERE discord_id = ?').get(discordId);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const aliases = req.body.aliases != null ? String(req.body.aliases).trim() : null;
  const notes   = req.body.notes   != null ? String(req.body.notes).trim()   : null;

  if (aliases === null && notes === null) {
    return res.status(400).json({ error: 'Provide aliases and/or notes' });
  }

  const current = db.prepare('SELECT aliases, notes FROM members WHERE discord_id = ?').get(discordId);
  const nextAliases = aliases !== null ? aliases : (current.aliases ?? '');
  const nextNotes   = notes   !== null ? notes   : (current.notes ?? '');

  try {
    const { updateMemberHumanFields } = await import('../services/sheets.js');
    await updateMemberHumanFields(discordId, nextAliases, nextNotes);
  } catch (err) {
    logger.error(`Failed to update Sheets for ${discordId}: ${err.message}`);
    return res.status(502).json({ error: err.message });
  }

  db.prepare(`
    UPDATE members SET aliases = ?, notes = ? WHERE discord_id = ?
  `).run(nextAliases, nextNotes, discordId);

  const updated = db.prepare('SELECT * FROM members WHERE discord_id = ?').get(discordId);
  logger.info(`Member ${discordId} aliases/notes updated by ${req.user.username}`);
  res.json(updated);
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
  const db = getDb();
  const latest = db
    .prepare(`SELECT MAX(last_synced_at) AS last_synced_at FROM members`)
    .get();
  const count = db
    .prepare(`SELECT COUNT(*) AS count FROM members`)
    .get();
  res.json({
    last_synced_at: latest?.last_synced_at ?? null,
    member_count: count?.count ?? 0,
  });
});

export default router;