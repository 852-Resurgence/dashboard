import express from 'express';
import cookieParser from 'cookie-parser';
import { initDb } from './db/client.js';
import { startBot } from './bot.js';
import { connectConsoleWS } from './services/crafty.js';
import { startWeeklySync } from './jobs/weeklySync.js';
import logger from './logger.js';
import env from './config/env.js';
import authRouter     from './routes/auth.js';
import warningsRouter from './routes/warnings.js';
import membersRouter  from './routes/members.js';
import craftyRouter   from './routes/crafty.js';
import { getBotStatus } from './bot.js';
import botlogsRouter  from './routes/botlogs.js';
import wikiRouter     from './routes/wiki.js';
import configRouter   from './routes/config.js';

async function main() {
  initDb();
  await startBot();
  connectConsoleWS();
  startWeeklySync();

  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (req, res) => {
    const bot = getBotStatus();
    res.json({
      ok: true,
      bot: {
        online: bot.online,
        uptime: bot.uptime,
        tag: bot.tag,
      },
    });
  });

  app.use(authRouter);
  app.use(warningsRouter);
  app.use(membersRouter);
  app.use(craftyRouter);
  app.use(botlogsRouter);
  app.use(wikiRouter);
  app.use(configRouter);

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  app.use((err, req, res, next) => {
    logger.error(`Unhandled error on ${req.method} ${req.path}: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(env.port, () => {
    logger.info(`Express listening on port ${env.port}`);
  });
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});