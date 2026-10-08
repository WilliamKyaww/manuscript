import { createHash } from 'node:crypto';
import { closeSync, createReadStream, openSync, readSync } from 'node:fs';
import path from 'node:path';
import { DETECT_HEAD_BYTES, extensionOf } from '@skb/core';
import { sanitiseFileName } from '@skb/core/markdown';
import { SOURCES_FOLDER } from '../notes/ignore';

/**
 * Where originals live (data-model.md §2): `Sources/<module code>/` once a module is known,
 * `Sources/Inbox/` until then. Paths are vault-relative and `/`-separated.
 */

export const INBOX_FOLDER = 'Inbox';

export function isSourcePath(relativePath: string): boolean {
  return relativePath.toLowerCase().startsWith(`${SOURCES_FOLDER.toLowerCase()}/`);
}

export function sourceFolder(moduleCode: string | null): string {
  return `${SOURCES_FOLDER}/${moduleCode ?? INBOX_FOLDER}`;
}

/** The module a file belongs to by its folder: `Sources/COC251/Week 1/a.pdf` → `COC251`. */
export function moduleCodeOf(relativePath: string): string | null {
  const segments = relativePath.split('/');
  if (segments.length < 3) return null;
  const folder = segments[1] ?? '';
  return folder.toLowerCase() === INBOX_FOLDER.toLowerCase() ? null : folder;
}

/** A source is titled by its file name, so renaming the file renames the source. */
export function titleOf(relativePath: string): string {
  const name = path.posix.basename(relativePath);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** A portable file name for an imported original, keeping its (lower-case) extension. */
export function safeSourceName(fileName: string): { base: string; extension: string } {
  const name = path.posix.basename(fileName.replace(/\\/g, '/'));
  const extension = extensionOf(name).replace(/[^a-z0-9]/g, '');
  const dot = name.lastIndexOf('.');
  // A leading dot would make the original a hidden file, which the vault index skips.
  const stem = (dot > 0 ? name.slice(0, dot) : name).replace(/^\.+/, '');
  return { base: sanitiseFileName(stem), extension };
}

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Hashes a file without loading it into memory or blocking the event loop. */
export function sha256File(absolutePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(absolutePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/** The first bytes of a file, for type detection. */
export function readHead(absolutePath: string): Uint8Array {
  const buffer = new Uint8Array(DETECT_HEAD_BYTES);
  const fd = openSync(absolutePath, 'r');
  try {
    const read = readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}
