import pino, { type Logger, type LoggerOptions } from 'pino';

const REDACTION_PATHS = ['*.token', '*.password', '*.apiKey', '*.authorization', '*.auth', '*.secret'];

export interface LoggerConfig {
  level?: LoggerOptions['level'];
  transport?: LoggerOptions['transport'];
  // For tests, allow injecting a destination stream
  destination?: NodeJS.WritableStream;
}

export const createLogger = (config: LoggerConfig = {}): Logger => {
  const options: LoggerOptions = {
    level: config.level ?? process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: REDACTION_PATHS,
      censor: '[REDACTED]',
    },
    transport: config.transport,
    hooks: {
      logMethod(args: any[], method: (...args: any[]) => void) {
        if (args.length > 0 && typeof args[0] === 'object') {
          args[0] = redactObject(args[0]);
        }
        return method.apply(this, args as any);
      },
    },
  } as any;
  if (config.destination) {
    return pino(options, config.destination as any);
  }
  return pino(options as any);
};

const redactObject = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;
  const clone: any = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    if (/token|password|apiKey|secret|authorization|auth/i.test(key)) {
      clone[key] = '[REDACTED]';
    } else if (typeof obj[key] === 'object') {
      clone[key] = redactObject(obj[key]);
    } else {
      clone[key] = obj[key];
    }
  }
  return clone;
};
