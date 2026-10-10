import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';

/**
 * The key AI provider keys are encrypted with (task 18.06). A random 32-byte key is made once and
 * kept in the data folder wrapped by Electron's `safeStorage` (the Windows data-protection API
 * under the user's login, the Keychain, or the desktop's secret service), so that a copy of the
 * data folder — a backup, a sync — cannot be opened elsewhere. The server gets the unwrapped key in
 * its environment and does the encrypting (`SKB_SECRETS_KEY`); where the operating system offers
 * no protection the keys stay as they are in web mode (a file only the user can read).
 */

const FILE = 'secrets.key';

export interface SecretsKey {
  /** Base64, 32 bytes — or null when the system cannot protect one. */
  key: string | null;
  protection: 'encrypted' | 'file';
}

export function loadSecretsKey(dataDir: string): SecretsKey {
  if (!safeStorage.isEncryptionAvailable()) return { key: null, protection: 'file' };
  const file = path.join(dataDir, FILE);
  try {
    if (existsSync(file)) {
      const key = safeStorage.decryptString(readFileSync(file));
      if (Buffer.from(key, 'base64').length === 32) return { key, protection: 'encrypted' };
    }
  } catch {
    // Unreadable (another user's login, a copied folder): a new key is made below. Keys saved with
    // the old one cannot be opened, which is the point of the protection.
  }
  const key = randomBytes(32).toString('base64');
  mkdirSync(dataDir, { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, safeStorage.encryptString(key), { mode: 0o600 });
  renameSync(temporary, file);
  return { key, protection: 'encrypted' };
}
