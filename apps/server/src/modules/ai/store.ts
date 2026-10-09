import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  type AiPreferences,
  AiPreferencesSchema,
  DEFAULT_AI_PREFERENCES,
  ProviderKindSchema,
} from '@skb/core';
import { z } from 'zod';
import type { Logger } from '../../shared/logger';
import { writeFileAtomic } from '../../vault/atomic';

/**
 * Where the AI configuration lives: in the per-user application data directory, never in the vault
 * (architecture.md §6, ADR-0005). `ai.json` holds the providers and preferences; `secrets.json` holds
 * the API keys, readable by the user only (mode 0600; on Windows the folder is the user's own). The
 * desktop app will swap the file store for Electron's `safeStorage` behind the same interface.
 */

export interface SecretStore {
  get(name: string): string | null;
  set(name: string, value: string): void;
  delete(name: string): void;
}

const SecretsFile = z.object({ version: z.literal(1), secrets: z.record(z.string(), z.string()) });

export function createFileSecretStore(dataDir: string, logger: Logger): SecretStore {
  const file = path.join(dataDir, 'secrets.json');
  let cache: Record<string, string> | null = null;
  const read = (): Record<string, string> => {
    if (cache) return cache;
    cache = {};
    if (existsSync(file)) {
      const parsed = SecretsFile.safeParse(safeJson(readFileSync(file, 'utf8')));
      if (parsed.success) cache = { ...parsed.data.secrets };
      else logger.warn('ai.secrets.unreadable', { file });
    }
    return cache;
  };
  const write = (secrets: Record<string, string>) => {
    cache = secrets;
    writeFileAtomic(file, `${JSON.stringify({ version: 1, secrets }, null, 2)}\n`, { mode: 0o600 });
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
