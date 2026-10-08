import type { Stats } from 'node:fs';
import { watch } from 'chokidar';
import type { Logger } from '../../shared/logger';
import type { Vault } from '../../vault/vault';
import type { NoteIndexer } from './indexer';

/**
 * Watches the vault for edits made in other programs (task 3.07) and feeds them to the indexer in
 * batches. Our own writes come back as events too; the indexer finds their content already indexed
 * and does nothing, so no write-token bookkeeping is needed (self-write suppression by hash).
 */

export interface VaultWatcher {
  /** Resolves when the initial directory walk has finished and events are being delivered. */
  readonly ready: Promise<void>;
  /** Applies any queued events now (tests and shutdown). */
  flush(): Promise<void>;
  close(): Promise<void>;
}

export interface WatchVaultOptions {
  vault: Vault;
  indexer: NoteIndexer;
  logger: Logger;
  /** How long to collect events before applying them as one batch. */
  batchMs?: number;
  /**
   * How long a deletion is held back. Renames arrive as an immediate `unlink` and a later `add`
   * (chokidar waits for writes to finish), so holding deletions lets the indexer recognise the move.
   */
  removalGraceMs?: number;
}

export function watchVault({
  vault,
  indexer,
  logger,
  batchMs = 200,
  removalGraceMs = 1000,
}: WatchVaultOptions): VaultWatcher {
  const pending = {
    changed: new Set<string>(),
    addedFolders: new Set<string>(),
  };
  /** Deleted files and folders, with when they were seen. */
  const removals = {
    removed: new Map<string, number>(),
    removedFolders: new Map<string, number>(),
  };
  let timer: NodeJS.Timeout | undefined;
  let closed = false;
  let flushing: Promise<void> = Promise.resolve();

  const toRelative = (absolutePath: string): string | null => {
    try {
      return vault.relative(absolutePath);
    } catch {
      return null;
    }
  };

  const isIgnored = (absolutePath: string, stats?: Stats): boolean => {
    const relative = toRelative(absolutePath);
    if (relative === null) return false;
    const classifier = indexer.classifier();
    if (stats?.isFile()) return classifier.classifyFile(relative) === 'ignored';
    // Directories, or not yet known: skip folders we never index (and hidden names).
    return classifier.isIgnoredFolder(relative);
  };

  const watcher = watch(vault.root, {
    ignoreInitial: true,
    followSymlinks: false,
    ignorePermissionErrors: true,
    // Wait for large copies and slow writers to finish before reading a file.
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    ignored: isIgnored,
  });

  /** Takes deletions that are old enough, or all of them when new files might be their moves. */
  const takeRemovals = (map: Map<string, number>, all: boolean): string[] => {
    const cutoff = Date.now() - removalGraceMs;
    const taken: string[] = [];
    for (const [entry, seenAt] of map) {
      if (all || seenAt <= cutoff) {
        taken.push(entry);
        map.delete(entry);
      }
    }
    return taken;
  };

  const applyPending = async (force: boolean) => {
    timer = undefined;
    await indexer.whenIdle();
    const takeAll = force || pending.changed.size > 0 || pending.addedFolders.size > 0;
    const batch = {
      changed: [...pending.changed],
      removed: takeRemovals(removals.removed, takeAll),
      addedFolders: [...pending.addedFolders],
      removedFolders: takeRemovals(removals.removedFolders, takeAll),
    };
    pending.changed.clear();
    pending.addedFolders.clear();
    if (removals.removed.size > 0 || removals.removedFolders.size > 0) schedule(removalGraceMs);
    if (Object.values(batch).every((list) => list.length === 0)) return;
    try {
      indexer.apply(batch, 'external');
    } catch (error) {
      logger.error('Could not apply changes made outside the app', { error });
    }
  };

  const schedule = (delay = batchMs) => {
    if (closed || timer) return;
    // Throttle rather than debounce, so a long burst (a sync client) still lands in batches.
    timer = setTimeout(() => {
      flushing = flushing.then(() => applyPending(false));
    }, delay);
  };

  const queue = (set: keyof typeof pending, absolutePath: string) => {
    const relative = toRelative(absolutePath);
    if (relative === null) return;
    pending[set].add(relative);
    schedule();
  };

  const queueRemoval = (set: keyof typeof removals, absolutePath: string) => {
    const relative = toRelative(absolutePath);
    if (relative === null) return;
    removals[set].set(relative, Date.now());
    schedule();
  };

  watcher.on('add', (file) => queue('changed', file));
  watcher.on('change', (file) => queue('changed', file));
  watcher.on('unlink', (file) => queueRemoval('removed', file));
  watcher.on('addDir', (folder) => queue('addedFolders', folder));
  watcher.on('unlinkDir', (folder) => queueRemoval('removedFolders', folder));
  watcher.on('error', (error) => logger.warn('File watcher error', { error }));

  const ready = new Promise<void>((resolve) => {
    watcher.once('ready', () => resolve());
  });

  return {
    ready,
    async flush() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      flushing = flushing.then(() => applyPending(true));
      await flushing;
    },
    async close() {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      await flushing;
      await watcher.close();
    },
  };
}
