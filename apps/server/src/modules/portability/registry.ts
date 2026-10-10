import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { writeFileAtomic } from '../../vault/atomic';

/**
 * The vaults this machine has opened, kept in the per-user data directory (never in a vault): a short
 * recent list for the switcher, and the vault to open the next time the application starts without
 * being told one (task 16.08). A damaged file is treated as empty — it only remembers conveniences.
 */

const FILE = 'vaults.json';
const MAX_RECENT = 12;

const RegistrySchema = z.object({
  version: z.literal(1),
  /** Opened at start-up when no vault is given on the command line or in the environment. */
  active: z.string().nullable(),
  recent: z.array(z.object({ path: z.string(), lastOpenedAt: z.string() })),
});
export type VaultRegistry = z.infer<typeof RegistrySchema>;

const empty = (): VaultRegistry => ({ version: 1, active: null, recent: [] });

/** The same folder written two ways must be one entry (case differs only on Windows). */
export const vaultKey = (folder: string) => {
  const resolved = path.resolve(folder);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

export function readRegistry(dataDir: string): VaultRegistry {
  const file = path.join(dataDir, FILE);
  if (!existsSync(file)) return empty();
  try {
    return RegistrySchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return empty();
  }
}

function write(dataDir: string, registry: VaultRegistry): void {
  writeFileAtomic(path.join(dataDir, FILE), `${JSON.stringify(registry, null, 2)}\n`);
}

/** Notes that a vault was opened: it moves to the front of the recent list. */
export function recordOpened(dataDir: string, vaultPath: string, at: Date): void {
  const registry = readRegistry(dataDir);
  const key = vaultKey(vaultPath);
  registry.recent = [
    { path: path.resolve(vaultPath), lastOpenedAt: at.toISOString() },
    ...registry.recent.filter((entry) => vaultKey(entry.path) !== key),
  ].slice(0, MAX_RECENT);
  write(dataDir, registry);
}

/** The vault to open on the next start. */
export function setActive(dataDir: string, vaultPath: string | null): void {
  const registry = readRegistry(dataDir);
  registry.active = vaultPath === null ? null : path.resolve(vaultPath);
  write(dataDir, registry);
}

/** Removes a vault from the list (the folder itself is never touched). */
export function forget(dataDir: string, vaultPath: string): void {
  const registry = readRegistry(dataDir);
  const key = vaultKey(vaultPath);
  registry.recent = registry.recent.filter((entry) => vaultKey(entry.path) !== key);
  if (registry.active !== null && vaultKey(registry.active) === key) registry.active = null;
  write(dataDir, registry);
}

/** For `resolveConfig`: the folder to open when nothing else says, if it is still there. */
export function activeVault(dataDir: string): string | null {
  const { active } = readRegistry(dataDir);
  return active !== null && existsSync(active) ? active : null;
}
