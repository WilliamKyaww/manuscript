import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import { hostname as osHostname } from 'node:os';
import path from 'node:path';
import {
  APP_ID,
  APP_NAME,
  ConflictError,
  type Id,
  type IdFactory,
  idSchema,
  NotFoundError,
  VAULT_META_DIR,
  ValidationError,
} from '@skb/core';
import { z } from 'zod';
import type { Clock } from '../shared/clock';
import { writeFileAtomic } from './atomic';
import { type ResolveOptions, resolveInVault, toVaultRelative } from './paths';

/** Version of the on-disk vault layout (`vault.json`). Bump only with a migration path. */
export const VAULT_LAYOUT_VERSION = 1;

const VaultFileSchema = z.object({
  id: idSchema('vault'),
  layoutVersion: z.number().int().positive(),
  createdAt: z.string(),
  createdBy: z.string(),
});
type VaultFile = z.infer<typeof VaultFileSchema>;

const LockFileSchema = z.object({
  pid: z.number().int(),
  hostname: z.string(),
  startedAt: z.string(),
});

export interface VaultPaths {
  meta: string;
  database: string;
  trash: string;
  history: string;
  cache: string;
  logs: string;
  backups: string;
}

export interface Vault {
  readonly root: string;
  readonly name: string;
  readonly id: Id<'vault'>;
  readonly createdAt: string;
  readonly paths: VaultPaths;
  /** Absolute path for a vault-relative path, with containment checks. */
  resolve(relativePath: string, options?: ResolveOptions): string;
  /** Portable `/`-separated relative path for an absolute path inside the vault. */
  relative(absolutePath: string): string;
  /** Releases the single-server lock. Idempotent. */
  close(): void;
}

export interface OpenVaultOptions {
  create: boolean;
  clock: Clock;
  ids: IdFactory;
  /** Written into `vault.json` as `createdBy`. */
  appVersion: string;
  pid?: number;
  hostname?: string;
  isProcessAlive?: (pid: number) => boolean;
}

export class VaultLockedError extends ConflictError {
  constructor(message: string, details: Record<string, unknown>) {
    super(message, { details });
    this.name = 'VaultLockedError';
  }
}

export function openVault(root: string, options: OpenVaultOptions): Vault {
  const absoluteRoot = path.resolve(root);
  if (!existsSync(absoluteRoot)) {
    if (!options.create) throw new NotFoundError(`Vault folder not found: ${absoluteRoot}`);
    mkdirSync(absoluteRoot, { recursive: true });
  } else if (!statSync(absoluteRoot).isDirectory()) {
    throw new ValidationError(`The vault path is not a folder: ${absoluteRoot}`);
  }

  const meta = path.join(absoluteRoot, VAULT_META_DIR);
  const paths: VaultPaths = {
    meta,
    database: path.join(meta, 'skb.db'),
    trash: path.join(meta, 'trash'),
    history: path.join(meta, 'history'),
    cache: path.join(meta, 'cache'),
    logs: path.join(meta, 'logs'),
    backups: path.join(meta, 'backups'),
  };
  for (const directory of [paths.trash, paths.history, paths.cache, paths.logs, paths.backups]) {
    mkdirSync(directory, { recursive: true });
  }

  const releaseLock = acquireLock(path.join(meta, 'lock'), options);
  let vaultFile: VaultFile;
  try {
    vaultFile = loadOrCreateVaultFile(path.join(meta, 'vault.json'), options);
  } catch (error) {
    releaseLock();
    throw error;
  }

  let closed = false;
  return {
    root: absoluteRoot,
    name: path.basename(absoluteRoot),
    id: vaultFile.id,
    createdAt: vaultFile.createdAt,
    paths,
    resolve: (relativePath, resolveOptions) =>
      resolveInVault(absoluteRoot, relativePath, resolveOptions),
    relative: (absolutePath) => toVaultRelative(absoluteRoot, absolutePath),
    close() {
      if (closed) return;
      closed = true;
      releaseLock();
    },
  };
}

function loadOrCreateVaultFile(file: string, options: OpenVaultOptions): VaultFile {
  if (existsSync(file)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      throw new ValidationError(`The vault file ${file} is not valid JSON.`, [], { cause: error });
    }
    const result = VaultFileSchema.safeParse(parsed);
    if (!result.success) throw new ValidationError(`The vault file ${file} is malformed.`);
    if (result.data.layoutVersion > VAULT_LAYOUT_VERSION) {
      throw new ValidationError(
        `This vault uses layout version ${result.data.layoutVersion}, which is newer than this application supports (${VAULT_LAYOUT_VERSION}). Please update the application.`,
      );
    }
    return result.data;
  }
  const created: VaultFile = {
    id: options.ids('vault'),
    layoutVersion: VAULT_LAYOUT_VERSION,
    createdAt: options.clock.now().toISOString(),
    createdBy: `${APP_ID}@${options.appVersion}`,
  };
  writeFileAtomic(file, `${JSON.stringify(created, null, 2)}\n`);
  return created;
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Creates `.skb/lock` exclusively; recovers stale locks left by crashed processes. */
function acquireLock(lockPath: string, options: OpenVaultOptions): () => void {
  const pid = options.pid ?? process.pid;
  const hostname = options.hostname ?? osHostname();
  const alive = options.isProcessAlive ?? isProcessAlive;
  const contents = `${JSON.stringify({ pid, hostname, startedAt: options.clock.now().toISOString() })}\n`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(lockPath, 'wx');
      try {
        writeSync(fd, contents);
      } finally {
        closeSync(fd);
      }
      return () => {
        try {
          const current = LockFileSchema.safeParse(JSON.parse(readFileSync(lockPath, 'utf8')));
          if (current.success && current.data.pid === pid && current.data.hostname === hostname) {
            rmSync(lockPath, { force: true });
          }
        } catch {
          // Lock already gone or unreadable: nothing to release.
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const holder = readLock(lockPath);
      if (holder && holder.hostname === hostname && holder.pid !== pid && alive(holder.pid)) {
        throw new VaultLockedError(
          `This vault is already open in another ${APP_NAME} process (PID ${holder.pid}). ` +
            `Close it first, or delete ${lockPath} if you are sure it is not running.`,
          { pid: holder.pid, lockPath },
        );
      }
      if (holder && holder.hostname !== hostname) {
        throw new VaultLockedError(
          `This vault is locked by another computer (${holder.hostname}). Delete ${lockPath} if that computer is not using it.`,
          { hostname: holder.hostname, lockPath },
        );
      }
      // Stale (dead process or unreadable): remove and retry once.
      rmSync(lockPath, { force: true });
    }
  }
  throw new VaultLockedError(`Could not acquire the vault lock at ${lockPath}.`, { lockPath });
}

function readLock(lockPath: string): z.infer<typeof LockFileSchema> | null {
  try {
    const result = LockFileSchema.safeParse(JSON.parse(readFileSync(lockPath, 'utf8')));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
