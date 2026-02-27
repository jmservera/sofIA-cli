// Minimal stub for pino
export interface LoggerOptions {
  level?: string;
  redact?: { paths: string[]; censor: string };
  transport?: any;
}

export interface Logger {
  info: (obj: any, msg?: string) => void;
  child: (bindings?: any) => Logger;
}

const pino = (opts: LoggerOptions = {}, destination?: NodeJS.WritableStream): Logger => {
  const write = (obj: any, msg?: string) => {
    const payload = JSON.stringify({ level: opts.level ?? 'info', msg, ...obj });
    if (destination) destination.write(payload + '\n');
    else process.stdout.write(payload + '\n');
  };
  return {
    info: write,
    child: () => pino(opts, destination),
  };
};

export default pino;
export { pino };
