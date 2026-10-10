import type { LogLevel } from '../config/config';

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(bindings: LogFields): Logger;
}

export interface LoggerOptions {
  level: LogLevel;
  format: 'pretty' | 'json';
  /** Sink for formatted lines; defaults to stdout (debug/info) and stderr (warn/error). */
  write?: (line: string, level: LogLevel) => void;
  /** Also receives every entry as one JSON line, whatever `format` is (the log file). */
  file?: (line: string) => void;
  bindings?: LogFields;
  now?: () => Date;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY =
  /(token|secret|password|passwd|api[-_]?key|authori[sz]ation|cookie|credential)/i;
const REDACTED = '[redacted]';
const MAX_DEPTH = 6;

/** Deep-copies a value, replacing anything under a sensitive-looking key and serialising errors. */
export function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return serialiseError(value, depth);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? REDACTED : redact(inner, depth + 1);
  }
  return result;
}

function serialiseError(error: Error, depth: number): Record<string, unknown> {
  const serialised: Record<string, unknown> = { name: error.name, message: error.message };
  const code = (error as { code?: unknown }).code;
  if (code !== undefined) serialised.code = code;
  if (error.stack) serialised.stack = error.stack;
  if (error.cause !== undefined && depth < MAX_DEPTH)
    serialised.cause = redact(error.cause, depth + 1);
  return serialised;
}

function defaultWrite(line: string, level: LogLevel): void {
  const stream = level === 'warn' || level === 'error' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

/** Local wall-clock time (HH:MM:SS) for human-readable console output; JSON logs use ISO UTC. */
export function localClockTime(time: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;
}

function formatPretty(time: Date, level: LogLevel, message: string, fields: LogFields): string {
  const clock = localClockTime(time);
  const extras = Object.entries(fields)
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' ');
  return `${clock} ${level.toUpperCase().padEnd(5)} ${message}${extras ? ` ${extras}` : ''}`;
}

export function createLogger(options: LoggerOptions): Logger {
  const write = options.write ?? defaultWrite;
  const now = options.now ?? (() => new Date());
  const bindings = options.bindings ?? {};
  const threshold = LEVEL_ORDER[options.level];

  const log = (level: LogLevel, message: string, fields: LogFields = {}) => {
    if (LEVEL_ORDER[level] < threshold) return;
    const merged = redact({ ...bindings, ...fields }) as LogFields;
    const time = now();
    const json =
      options.format === 'json' || options.file
        ? JSON.stringify({ time: time.toISOString(), level, msg: message, ...merged })
        : '';
    write(options.format === 'json' ? json : formatPretty(time, level, message, merged), level);
    options.file?.(json);
  };

  return {
    debug: (message, fields) => log('debug', message, fields),
    info: (message, fields) => log('info', message, fields),
    warn: (message, fields) => log('warn', message, fields),
    error: (message, fields) => log('error', message, fields),
    child: (childBindings) =>
      createLogger({ ...options, bindings: { ...bindings, ...childBindings } }),
  };
}

/** A logger that discards everything — for tests that do not assert on logs. */
export const silentLogger: Logger = createLogger({
  level: 'error',
  format: 'json',
  write: () => {},
});
