import { appendFileSync } from 'fs';

const DEBUG_LOG = process.env.DEBUG_LOG_PATH || '/app/logs/debug-e132f4.log';

export function debugLog(location, message, data = {}, hypothesisId = '') {
  const entry = {
    sessionId: 'e132f4',
    timestamp: Date.now(),
    location,
    message,
    data,
    hypothesisId,
  };
  const line = `${JSON.stringify(entry)}\n`;
  try {
    appendFileSync(DEBUG_LOG, line);
  } catch {
    /* ignore if log dir missing */
  }
  console.log('[DEBUG-e132f4]', line.trim());
}
