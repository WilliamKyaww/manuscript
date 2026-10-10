import {
  closeSync,
  createReadStream,
  createWriteStream,
  mkdirSync,
  openSync,
  type WriteStream,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import { ValidationError } from '@skb/core';
import { Unzip, UnzipInflate, Zip, ZipDeflate } from 'fflate';

/**
 * Zip files for export and restore (Phase 16), written and read as streams so a vault with hundreds of
 * megabytes of slides and recordings never has to fit in memory. Formats that are already compressed
 * are not compressed again; text and JSON are deflated. Entry names are checked on the way in: nothing
 * can be written outside the folder it is extracted to.
 */

const STORED = new Set([
  '.pdf',
  '.pptx',
  '.docx',
  '.xlsx',
  '.zip',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.heic',
  '.mp3',
  '.m4a',
  '.aac',
  '.ogg',
  '.opus',
  '.flac',
  '.mp4',
  '.mov',
  '.mkv',
  '.webm',
  '.7z',
  '.gz',
]);
const CHUNK = 512 * 1024;
const MAX_ENTRIES = 1_000_000;
/** Entries made by the export have no time of their own; the format cannot go before 1980. */
const DATA_TIME = new Date(Date.UTC(2000, 0, 1));
const zipTime = (date: Date) =>
  date.getUTCFullYear() < 1980 || date.getUTCFullYear() > 2099 ? DATA_TIME : date;

export interface ZipWriter {
  /** Adds a small file held in memory. */
  addData(name: string, data: Uint8Array | string): Promise<void>;
  /** Adds a file from disk, read in chunks. */
  addFile(name: string, file: string, modified?: Date): Promise<void>;
  /** Writes the end of the archive and closes the file. */
  finish(): Promise<void>;
}

export function createZipWriter(target: string): ZipWriter {
  mkdirSync(path.dirname(target), { recursive: true });
  const out: WriteStream = createWriteStream(target);
  let failure: Error | null = null;
  let drain: Promise<void> | null = null;
  let closed: Promise<void> | null = null;
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      failure = error;
      return;
    }
    if (!out.write(chunk) && !drain)
      drain = new Promise((resolve) =>
        out.once('drain', () => {
          drain = null;
          resolve();
        }),
      );
    if (final) {
      closed = new Promise((resolve, reject) => {
        out.once('error', reject);
        out.end(resolve);
      });
    }
  });
  out.on('error', (error) => {
    failure = error;
  });
  const check = () => {
    if (failure) throw failure;
  };
  // Formats that are compressed already are written with level 0: deflate's own "stored" blocks. The
  // zip "stored" method cannot be read back in one pass without the central directory (a streamed
  // entry carries no size), but a deflate stream says where it ends.
  const entryFor = (name: string) =>
    new ZipDeflate(name, { level: STORED.has(path.extname(name).toLowerCase()) ? 0 : 6 });

  return {
    async addData(name, data) {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const entry = new ZipDeflate(name, { level: 6 });
      entry.mtime = DATA_TIME;
      zip.add(entry);
      entry.push(bytes, true);
      check();
      if (drain) await drain;
    },
    async addFile(name, file, modified) {
      const entry = entryFor(name);
      if (modified) entry.mtime = zipTime(modified);
      zip.add(entry);
      const source = createReadStream(file, { highWaterMark: CHUNK });
      let pending: Uint8Array | null = null;
      for await (const chunk of source) {
        // Hold one chunk back so the last one can be marked final.
        if (pending) entry.push(pending, false);
        pending = chunk as Uint8Array;
        check();
        if (drain) await drain;
      }
      entry.push(pending ?? new Uint8Array(0), true);
      check();
      if (drain) await drain;
    },
    async finish() {
      zip.end();
      check();
      if (closed) await closed;
      check();
    },
  };
}

/** Why an entry name cannot be extracted, or null. */
export function unsafeEntryName(name: string): string | null {
  if (name === '' || name.includes('\0')) return 'an empty or invalid name';
  if (name.startsWith('/') || name.startsWith('\\') || /^[A-Za-z]:/u.test(name))
    return 'an absolute path';
  if (name.split(/[\\/]/u).includes('..')) return 'a path that climbs out of its folder';
  return null;
}

/** Where an entry's bytes go: nowhere (skipped), memory, or a file. */
export type EntrySink =
  | { kind: 'skip' }
  | { kind: 'memory'; done(data: Uint8Array): void }
  | { kind: 'file'; path: string; modified?: boolean };

/**
 * Reads a zip in one pass. `route` decides for each entry where it goes; files are written as they
 * arrive. Returns how many entries were seen. Entries should come in the order the archive was
 * written (the export puts what a restore needs to know first).
 */
export async function readZip(file: string, route: (name: string) => EntrySink): Promise<number> {
  let seen = 0;
  let failure: Error | null = null;
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (entry) => {
    const name = entry.name;
    if (name.endsWith('/')) return;
    seen += 1;
    if (seen > MAX_ENTRIES) {
      failure = new ValidationError('That archive has too many files to be an export.');
      return;
    }
    const problem = unsafeEntryName(name);
    if (problem) {
      failure = new ValidationError(`That archive is not safe to open: “${name}” is ${problem}.`);
      return;
    }
    const sink = route(name);
    if (sink.kind === 'skip') return;
    if (sink.kind === 'memory') {
      const parts: Uint8Array[] = [];
      entry.ondata = (error, data, final) => {
        if (error) {
          failure = error;
          return;
        }
        parts.push(data);
        if (final) {
          const total = parts.reduce((sum, part) => sum + part.length, 0);
          const all = new Uint8Array(total);
          let at = 0;
          for (const part of parts) {
            all.set(part, at);
            at += part.length;
          }
          sink.done(all);
        }
      };
      entry.start();
      return;
    }
    mkdirSync(path.dirname(sink.path), { recursive: true });
    const fd = openSync(sink.path, 'w');
    entry.ondata = (error, data, final) => {
      if (error) {
        failure = error;
        closeSync(fd);
        return;
      }
      writeSync(fd, data);
      if (final) closeSync(fd);
    };
    entry.start();
  };

  for await (const chunk of createReadStream(file, { highWaterMark: CHUNK })) {
    unzip.push(chunk as Uint8Array, false);
    if (failure) throw failure;
  }
  unzip.push(new Uint8Array(0), true);
  if (failure) throw failure;
  return seen;
}
