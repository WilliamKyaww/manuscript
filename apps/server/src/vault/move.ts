import { cpSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Moves a file or folder within the vault. Renames are retried briefly because Windows refuses to
 * rename something another program (an antivirus scanner, a sync client, a file watcher) has open;
 * a folder that still cannot be renamed is copied and then removed, which only needs read access.
 */

const RETRYABLE = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RETRY_DELAYS_MS = [10, 25, 50, 100, 200, 400];

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

export function movePath(from: string, to: string): void {
  mkdirSync(path.dirname(to), { recursive: true });
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      const delay = RETRY_DELAYS_MS[attempt];
      if (RETRYABLE.has(code) && delay !== undefined) {
        sleepSync(delay);
        continue;
      }
      // EXDEV: a different drive (possible for a symlinked .skb); EPERM: a locked folder on Windows.
      if ((code === 'EXDEV' || RETRYABLE.has(code)) && statSync(from).isDirectory()) {
        cpSync(from, to, {
          recursive: true,
          errorOnExist: true,
          force: false,
          preserveTimestamps: true,
        });
        rmSync(from, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
        return;
      }
      throw error;
    }
  }
}
