import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from '../vault/atomic';

/**
 * The local API token (ADR-0005). It is generated once per user, stored in the application data
 * directory (never in the vault) and reused across restarts so that bookmarks keep working.
 */

const TOKEN_FILE = 'auth-token';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,}$/;

export function tokenFilePath(dataDir: string): string {
  return path.join(dataDir, TOKEN_FILE);
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Returns the override if given, otherwise the persisted token (creating it on first use). */
export function loadOrCreateToken(dataDir: string, override: string | null = null): string {
  if (override) return override;
  const file = tokenFilePath(dataDir);
  if (existsSync(file)) {
    const stored = readFileSync(file, 'utf8').trim();
    if (TOKEN_PATTERN.test(stored)) return stored;
    // A corrupt or weak token is replaced rather than trusted.
  }
  const token = generateToken();
  writeFileAtomic(file, `${token}\n`, { mode: 0o600 });
  return token;
}

/** Constant-time comparison that does not leak the token length through early exits. */
export function tokensEqual(expected: string, candidate: string | undefined | null): boolean {
  if (!candidate) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(candidate, 'utf8');
  if (a.length !== b.length) {
    // Still do a comparison of equal length to keep timing uniform.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}
