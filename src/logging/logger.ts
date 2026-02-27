/**
 * Logger setup with pino.
 *
 * Features:
 * - File logging when --log-file is provided
 * - Stderr logging by default
 * - Automatic redaction of secrets/PII (password, token, secret, key, auth)
 */
import pino from 'pino';
import type { Logger } from 'pino';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface LoggerOptions {
  logFile?: string;
  level?: string;
  name?: string;
}

const REDACT_PATHS = [
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'auth',
  'credential',
  'credentials',
];

/**
 * Create a configured pino logger.
 *
 * If logFile is specified, logs go to the file.
 * Otherwise, logs go to stderr (to keep stdout clean for CLI output).
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const { logFile, level = 'info', name = 'sofia' } = options;

  const pinoOpts: pino.LoggerOptions = {
    name,
    level,
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
  };

  if (logFile) {
    mkdirSync(dirname(logFile), { recursive: true });
    const dest = pino.destination({ dest: logFile, sync: false });
    return pino(pinoOpts, dest);
  }

  // Default: write to stderr to keep stdout clean
  return pino(pinoOpts, pino.destination({ dest: 2, sync: false }));
}

/** Global logger instance; call initGlobalLogger() to configure it. */
let globalLogger: Logger | undefined;

export function initGlobalLogger(options: LoggerOptions = {}): Logger {
  globalLogger = createLogger(options);
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = createLogger();
  }
  return globalLogger;
}
