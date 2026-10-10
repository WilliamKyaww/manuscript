import { randomBytes } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, rmSync, writeSync } from 'node:fs';
import path from 'node:path';
import { ValidationError } from '@skb/core';

/** Windows refuses a path of 260 characters or more unless long paths are switched on system-wide. */
export const WINDOWS_PATH_LIMIT = 259;

/**
 * Says so, in words, when a path cannot be written on Windows. Without this the operating system
 * answers "file not found" for a file that was about to be created.
 */
export function assertPathFits(target: string, platform: NodeJS.Platform = process.platform): void {
  if (platform !== 'win32' || target.startsWith('\\\\?\\')) return;
  if (target.length > WINDOWS_PATH_LIMIT)
    throw new ValidationError(
      'That would make the full path of a file longer than Windows allows (260 characters). ' +
        'Use a shorter name or a shallower folder, or keep the vault closer to the top of the drive.',
    );
}

/**
 * Writes a file so that readers never see a partial write and a crash never leaves a truncated
 * file: write to a temporary sibling, flush, then rename over the target (architecture.md §5).
 *
 * Temporary files are named `.<name>.<pid>.<random>.tmp`; file watchers must ignore that pattern.
 */
export interface AtomicWriteOptions {
  /** Flush file contents to disk before renaming (default true). */
  fsync?: boolean;
  /** File permission bits for the new file on POSIX systems (e.g. 0o600 for secrets). */
  mode?: number;
}

export function writeFileAtomic(
  target: string,
  data: string | Uint8Array,
  options: AtomicWriteOptions = {},
): void {
  const directory = path.dirname(target);
  const temporary = path.join(
    directory,
    `.${path.basename(target)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`,
  );
  // The temporary sibling is the longer name: if it fits, the target does.
  assertPathFits(temporary);
  mkdirSync(directory, { recursive: true });
  const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  const fd = openSync(temporary, 'wx', options.mode ?? 0o666);
  try {
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(fd, bytes, offset, bytes.length - offset);
    }
    if (options.fsync !== false) fsyncSync(fd);
  } catch (error) {
    closeSync(fd);
    rmSync(temporary, { force: true });
    throw error;
  }
  closeSync(fd);
  try {
    renameWithRetry(temporary, target);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

/** Matches temporary files created by `writeFileAtomic`. */
export const ATOMIC_TEMP_PATTERN = /^\..+\.\d+\.[0-9a-f]{8}\.tmp$/;

const RETRYABLE = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RETRY_DELAYS_MS = [10, 25, 50, 100, 200, 400];

/**
 * On Windows, antivirus scanners, indexers and sync clients (OneDrive) briefly lock files, which
 * makes rename fail with EPERM/EBUSY. A short, bounded retry resolves this in practice.
 */
function renameWithRetry(from: string, to: string): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const delay = RETRY_DELAYS_MS[attempt];
      if (!code || !RETRYABLE.has(code) || delay === undefined) throw error;
      sleepSync(delay);
    }
  }
}

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}
