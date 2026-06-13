import winston from 'winston';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = process.env.LOG_DIR || join(__dirname, '../../logs');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const RING_SIZE = 500;
const ring = [];

const ringTransport = new winston.transports.Stream({
  stream: {
    write(chunk) {
      try {
        const entry = JSON.parse(chunk);
        ring.push({
          ts: entry.timestamp,
          level: entry.level,
          message: entry.message,
        });
        if (ring.length > RING_SIZE) ring.shift();
      } catch { /* ignore malformed lines */ }
    },
  },
});

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, stack }) =>
          stack
            ? `[${timestamp}] ${level}: ${message}\n${stack}`
            : `[${timestamp}] ${level}: ${message}`
        )
      ),
    }),
    // rotating files
    new winston.transports.File({
      filename: join(LOG_DIR, 'panel.log'),
      maxsize: 10 * 1024 * 1024, // 10 MB per file
      maxFiles: 14,
      tailable: true,
    }),
    ringTransport,
  ],
});

// expose ring buffer for the /api/logs endpoint
export function getLogRing() {
  return [...ring];
}

export default logger;