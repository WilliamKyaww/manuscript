import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  type AiPreferences,
  AiPreferencesSchema,
  DEFAULT_AI_PREFERENCES,
  ProviderKindSchema,
  UnavailableError,
} from '@skb/core';
import { z } from 'zod';
import type { Logger } from '../../shared/logger';
import { writeFileAtomic } from '../../vault/atomic';

/**
 * Where the AI configuration lives: in the per-user application data directory, never in the vault
 * (architecture.md §6, ADR-0005). `ai.json` holds the providers and preferences; `secrets.json` holds
 * the API keys, readable by the user only (mode 0600; on Windows the folder is the user's own). Under
 * the desktop app the file is also encrypted (AES-256-GCM) with a key that Electron's `safeStorage`
 * protects with the operating system, so a copy of the folder is not a copy of the keys.
 */

export interface SecretStore {
  get(name: string): string | null;
  set(name: string, value: string): void;
  delete(name: string): void;
}

const SecretsFile = z.object({ version: z.literal(1), secrets: z.record(z.string(), z.string()) });
const EncryptedSecretsFile = z.object({
  version: z.literal(2),
  algorithm: z.literal('aes-256-gcm'),
  iv: z.string(),
  tag: z.string(),
  data: z.string(),
});

/** AES-256-GCM over the JSON of the secrets, with a fresh nonce for every write. */
export function encryptSecrets(secrets: Record<string, string>, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(secrets), 'utf8'), cipher.final()]);
  return JSON.stringify({
    version: 2,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  });
}

function decryptSecrets(
  file: z.infer<typeof EncryptedSecretsFile>,
  key: Buffer,
): Record<string, string> | null {
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(file.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(file.tag, 'base64'));
    const text = Buffer.concat([
      decipher.update(Buffer.from(file.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    const parsed = z.record(z.string(), z.string()).safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createFileSecretStore(
  dataDir: string,
  logger: Logger,
  key: Buffer | null = null,
): SecretStore {
  const file = path.join(dataDir, 'secrets.json');
  let cache: Record<string, string> | null = null;
  /** The file holds keys that only the desktop app can open: never overwrite it from here. */
  let locked = false;
  const serialise = (secrets: Record<string, string>) =>
    key ? encryptSecrets(secrets, key) : JSON.stringify({ version: 1, secrets }, null, 2);
  const write = (secrets: Record<string, string>) => {
    if (locked)
      throw new UnavailableError(
        'The AI keys were saved by the desktop app and are encrypted; they can only be changed there.',
      );
    cache = secrets;
    writeFileAtomic(file, `${serialise(secrets)}\n`, { mode: 0o600 });
  };
  const read = (): Record<string, string> => {
    if (cache) return cache;
    cache = {};
    if (!existsSync(file)) return cache;
    const raw = safeJson(readFileSync(file, 'utf8'));
    const encrypted = EncryptedSecretsFile.safeParse(raw);
    if (encrypted.success) {
      if (!key) {
        locked = true;
        logger.warn('ai.secrets.encrypted_without_key', { file });
        return cache;
      }
      const opened = decryptSecrets(encrypted.data, key);
      if (opened) cache = opened;
      else logger.warn('ai.secrets.unreadable', { file });
      return cache;
    }
    const plain = SecretsFile.safeParse(raw);
    if (plain.success) {
      cache = { ...plain.data.secrets };
      // Keys saved before the file was encrypted are encrypted the first time they are read.
      if (key && Object.keys(cache).length > 0) {
        try {
          writeFileAtomic(file, `${encryptSecrets(cache, key)}\n`, { mode: 0o600 });
        } catch (error) {
          logger.warn('ai.secrets.not_encrypted', { error });
        }
      }
    } else logger.warn('ai.secrets.unreadable', { file });
    return cache;
  };
  return {
    get: (name) => read()[name] ?? null,
    set: (name, value) => write({ ...read(), [name]: value }),
    delete: (name) => {
      const { [name]: _removed, ...rest } = read();
      write(rest);
    },
  };
}

export const StoredProviderSchema = z.object({
  id: z.string(),
  kind: ProviderKindSchema,
  name: z.string(),
  baseUrl: z.string().nullable(),
});
export type StoredProvider = z.infer<typeof StoredProviderSchema>;

export interface AiConfig {
  providers: StoredProvider[];
  preferences: AiPreferences;
}

export interface AiConfigStore {
  read(): AiConfig;
  write(config: AiConfig): void;
}

const ConfigFile = z.object({
  version: z.literal(1),
  providers: z.array(StoredProviderSchema),
  preferences: z.unknown(),
});

/** Preferences that no longer validate fall back to the defaults, with a warning. */
function preferencesFrom(value: unknown, logger: Logger): AiPreferences {
  const parsed = AiPreferencesSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  if (value !== undefined)
    logger.warn('ai.preferences.invalid', { issues: parsed.error.issues.length });
  return structuredClone(DEFAULT_AI_PREFERENCES);
}

export function createFileConfigStore(dataDir: string, logger: Logger): AiConfigStore {
  const file = path.join(dataDir, 'ai.json');
  let cache: AiConfig | null = null;
  return {
    read() {
      if (cache) return structuredClone(cache);
      cache = { providers: [], preferences: structuredClone(DEFAULT_AI_PREFERENCES) };
      if (existsSync(file)) {
        const parsed = ConfigFile.safeParse(safeJson(readFileSync(file, 'utf8')));
        if (parsed.success)
          cache = {
            providers: parsed.data.providers,
            preferences: preferencesFrom(parsed.data.preferences, logger),
          };
        else logger.warn('ai.config.unreadable', { file });
      }
      return structuredClone(cache);
    },
    write(config) {
      cache = structuredClone(config);
      writeFileAtomic(file, `${JSON.stringify({ version: 1, ...config }, null, 2)}\n`);
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** An in-memory pair for tests. */
export function createMemoryStores(): { config: AiConfigStore; secrets: SecretStore } {
  let config: AiConfig = { providers: [], preferences: structuredClone(DEFAULT_AI_PREFERENCES) };
  const secrets = new Map<string, string>();
  return {
    config: {
      read: () => structuredClone(config),
      write: (next) => {
        config = structuredClone(next);
      },
    },
    secrets: {
      get: (name) => secrets.get(name) ?? null,
      set: (name, value) => void secrets.set(name, value),
      delete: (name) => void secrets.delete(name),
    },
  };
}
