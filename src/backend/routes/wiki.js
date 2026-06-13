import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { createUser, setUserGroup, getRecentLogs } from '../services/wiki.js';
import logger from '../logger.js';

const router = Router();

router.use(authMiddleware);

// GET /api/wiki/logs?limit=50&type=
router.get('/api/wiki/logs', async (req, res) => {
  try {
    const logs = await getRecentLogs({
      limit: parseInt(req.query.limit ?? 50, 10),
      type:  req.query.type ?? '',
    });
    res.json(logs);
  } catch (err) {
    logger.error(`Wiki logs fetch failed: ${err.message}`);
    res.status(502).json({ error: 'Could not reach MediaWiki' });
  }
});

// POST /api/wiki/users
router.post('/api/wiki/users', requireRole('mod'), async (req, res) => {
  const { username, password, email } = req.body;
  if (!username) return res.status(400).json({ error: 'username is required' });

  try {
    const result = await createUser({ username, password, email });
    logger.info(`Wiki user created: ${username} by ${req.user.username}`);
    res.status(201).json(result);
  } catch (err) {
    logger.error(`Wiki user creation failed: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
});

// PATCH /api/wiki/users/:username/groups
router.patch('/api/wiki/users/:username/groups', requireRole('mod'), async (req, res) => {
  const { addGroups = [], removeGroups = [] } = req.body;
  const { username } = req.params;

  if (!addGroups.length && !removeGroups.length) {
    return res.status(400).json({ error: 'addGroups or removeGroups must be provided' });
  }

  try {
    const result = await setUserGroup({ username, addGroups, removeGroups });
    logger.info(`Wiki groups updated for ${username} by ${req.user.username}: +[${addGroups}] -[${removeGroups}]`);
    res.json(result);
  } catch (err) {
    logger.error(`Wiki group update failed: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
});

export default router;