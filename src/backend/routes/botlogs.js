import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getLogRing } from '../logger.js';

const router = Router();

router.use(authMiddleware);

// GET /api/logs?level=info&limit=200
router.get('/api/logs', (req, res) => {
  const { level, limit = 200 } = req.query;

  let entries = getLogRing();

  if (level && level !== 'all') {
    entries = entries.filter(e => e.level === level);
  }

  const capped = entries.slice(-parseInt(limit, 10));
  res.json(capped);
});

export default router;