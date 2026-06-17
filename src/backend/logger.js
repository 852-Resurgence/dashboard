import winston from 'winston';
import Transport from 'winston-transport';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = process.env.LOG_DIR || join(__dirname, '../logs');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const RING_SIZE = 500;
const ring = [];

class RingBufferTransport extends Transport {
  log(info, callback) {
    ring.push({
      ts: info.timestamp,
      level: info.level,
      message: info.message,
    });
    if (ring.length > RING_SIZE) ring.shift();
    callback();
  }
}

mkdirSync(LOG_DIR, { recursive: true });

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
    new winston.transports.File({
      filename: join(LOG_DIR, 'panel.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 14,
      tailable: true,
    }),
    new RingBufferTransport(),
  ],
});

export function getLogRing() {
  return [...ring];
}

export default logger;
