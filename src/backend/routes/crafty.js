import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { sendCommand, getServerStatus, attachConsoleStream } from '../services/crafty.js';
import logger from '../logger.js';

const router = Router();

router.use(authMiddleware);

// GET /api/console/status
router.get('/api/console/status', async (req, res) => {
  try {
    const status = await getServerStatus();
    res.json(status);
  } catch (err) {
    logger.error(`Failed to fetch Crafty status: ${err.message}`);
    res.status(502).json({ error: 'Could not reach Crafty' });
  }
});

// POST /api/console/command
router.post('/api/console/command', requireRole('mod'), async (req, res) => {
  const { command } = req.body;
  if (!command?.trim()) {
    return res.status(400).json({ error: 'command is required' });
  }

  try {
    await sendCommand(command.trim());
    logger.info(`Console command sent by ${req.user.username}: ${command.trim()}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Console command failed: ${err.message}`);
    res.status(502).json({ error: 'Failed to send command to Crafty' });
  }
});

// GET /api/console/stream
router.get('/api/console/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // 30s proxy heartbeat
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  req.on('close', () => clearInterval(heartbeat));

  attachConsoleStream(res);
});

export default router;