import { type Dirent, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { VaultClassifier } from './ignore';

/**
 * Walks the vault and lists notes, attachments and folders with their size and modification time.
 * Symbolic links and junctions are not followed, so the walk can never leave the vault or loop.
 */

export interface ScannedFile {
  path: string;
  kind: 'note' | 'attachment';
  sizeBytes: number;
  mtimeMs: number;
  birthtimeMs: number;
}

export interface VaultScan {
  files: ScannedFile[];
  /** Every indexed folder (vault-relative), sorted. */
  folders: string[];
  /** Entries that could not be read (permissions, races with deletion). */
  errors: { path: string; message: string }[];
}

export function scanVault(root: string, classifier: VaultClassifier): VaultScan {
  const files: ScannedFile[] = [];
  const folders: string[] = [];
  const errors: { path: string; message: string }[] = [];

  const walk = (relativeFolder: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(path.join(root, relativeFolder), { withFileTypes: true });
    } catch (error) {
      errors.push({ path: relativeFolder, message: (error as Error).message });
      return;
    }
    for (const entry of entries) {
      const relative = relativeFolder === '' ? entry.name : `${relativeFolder}/${entry.name}`;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (classifier.isIgnoredFolder(relative)) continue;
        folders.push(relative);
        walk(relative);
      } else if (entry.isFile()) {
        const kind = classifier.classifyFile(relative);
        if (kind === 'ignored') continue;
        try {
          const stats = statSync(path.join(root, relative));
          files.push({
            path: relative,
            kind,
            sizeBytes: stats.size,
            mtimeMs: Math.trunc(stats.mtimeMs),
            birthtimeMs: Math.trunc(stats.birthtimeMs || stats.mtimeMs),
          });
        } catch (error) {
          errors.push({ path: relative, message: (error as Error).message });
        }
      }
    }
  };

  walk('');
  folders.sort();
  return { files, folders, errors };
}
