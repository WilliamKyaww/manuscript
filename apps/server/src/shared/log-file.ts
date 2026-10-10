import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

/**
 * Log files in the vault's `.skb/logs/` (task 17.06): one JSON line per entry, one file per day, a day's
 * file moved aside when it passes a size cap, and files older than a week removed. The logger starts
 * before the vault is open, so lines wait in memory until the folder is attached. Writing a log must
 * never be what breaks the application: every failure here is swallowed.
 */

export const LOG_KEEP_DAYS = 7;
export const LOG_MAX_BYTES = 5 * 1024 * 1024;
const PENDING_LINES = 500;
const NAME = /^manuscript-(\d{4}-\d{2}-\d{2})(?:\.old)?\.log$/u;

export interface DeferredLogFile {
  write(line: string): void;
  /** Starts writing to `directory`, first what was held back. */
  attach(directory: string): void;
  readonly directory: string | null;
}

export function createDeferredLogFile(
  now: () => Date = () => new Date(),
  maxBytes = LOG_MAX_BYTES,
): DeferredLogFile {
  let directory: string | null = null;
  const waiting: string[] = [];
  let prunedFor = '';

  const day = () => now().toISOString().slice(0, 10);

  function append(line: string): void {
    if (directory === null) return;
    const today = day();
    const file = path.join(directory, `manuscript-${today}.log`);
    try {
      if (existsSync(file) && statSync(file).size >= maxBytes)
        renameSync(file, path.join(directory, `manuscript-${today}.old.log`));
      appendFileSync(file, `${line}\n`);
      if (prunedFor !== today) {
        prunedFor = today;
        prune(directory, today);
      }
    } catch {
      // A log must never break the application.
    }
  }

  return {
    get directory() {
      return directory;
    },
    write(line) {
      if (directory === null) {
        waiting.push(line);
        if (waiting.length > PENDING_LINES) waiting.shift();
        return;
      }
      append(line);
    },
    attach(next) {
      try {
        mkdirSync(next, { recursive: true });
      } catch {
        return;
      }
      directory = next;
      for (const line of waiting.splice(0)) append(line);
    },
  };
}

/** The log files in a folder, oldest first (a day's rolled-over file comes before its current one). */
export function listLogFiles(directory: string): { name: string; sizeBytes: number }[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry) => NAME.test(entry))
    .map((entry) => ({ name: entry, sizeBytes: statSync(path.join(directory, entry)).size }))
    .sort((a, b) => {
      const dayOf = (name: string) => NAME.exec(name)?.[1] ?? '';
      return (
        dayOf(a.name).localeCompare(dayOf(b.name)) ||
        Number(b.name.includes('.old')) - Number(a.name.includes('.old'))
      );
    });
}

function prune(directory: string, today: string): void {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - LOG_KEEP_DAYS);
  const limit = cutoff.toISOString().slice(0, 10);
  for (const entry of readdirSync(directory)) {
    const match = NAME.exec(entry);
    if (match?.[1] && match[1] < limit) rmSync(path.join(directory, entry), { force: true });
  }
}
