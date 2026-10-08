import { unzipSync } from 'fflate';
import { SourceParseError } from './errors';

/**
 * Reads selected entries of an Office (ZIP) file with limits that defeat zip bombs (task 5.09).
 * fflate inflates each entry into a buffer of exactly its *declared* size and never grows it, so
 * checking the declared sizes before inflating bounds memory even when a header lies (a lying
 * entry is truncated and then fails to parse). Only the XML parts a parser asks for are inflated;
 * media are never touched.
 */

export interface ZipLimits {
  maxEntries: number;
  /** Largest single entry we inflate. */
  maxEntryBytes: number;
  /** Total of all inflated entries. */
  maxTotalBytes: number;
  /** Largest plausible compression ratio for an entry bigger than 1 MiB. */
  maxRatio: number;
}

const MIB = 1024 * 1024;

export const ZIP_LIMITS: ZipLimits = {
  maxEntries: 20_000,
  maxEntryBytes: 32 * MIB,
  maxTotalBytes: 128 * MIB,
  maxRatio: 1000,
};

export function readZipEntries(
  bytes: Uint8Array,
  wanted: (name: string) => boolean,
  description: string,
  limits: ZipLimits = ZIP_LIMITS,
): Map<string, Uint8Array> {
  let entries = 0;
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter(file) {
        entries += 1;
        if (entries > limits.maxEntries) {
          throw new SourceParseError(
            `The ${description} contains too many parts to be read safely.`,
          );
        }
        if (!wanted(file.name)) return false;
        const ratio = file.originalSize / Math.max(1, file.size);
        if (
          file.originalSize > limits.maxEntryBytes ||
          (file.originalSize > MIB && ratio > limits.maxRatio)
        ) {
          throw new SourceParseError(
            `The ${description} contains a part that expands to an unsafe size, so it was not read.`,
          );
        }
        total += file.originalSize;
        if (total > limits.maxTotalBytes) {
          throw new SourceParseError(`The ${description} is too large to be read safely.`);
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof SourceParseError) throw error;
    throw new SourceParseError(`The ${description} is damaged or is not a valid Office file.`, {
      cause: error,
    });
  }
  return new Map(Object.entries(files));
}

/** Resolves a relationship target against the folder of the part that refers to it. */
export function resolvePartPath(baseFolder: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const segments = baseFolder === '' ? [] : baseFolder.split('/');
  for (const segment of target.split('/')) {
    if (segment === '..') segments.pop();
    else if (segment !== '.' && segment !== '') segments.push(segment);
  }
  return segments.join('/');
}

const utf8 = new TextDecoder('utf-8');

export function decodeXml(bytes: Uint8Array | undefined): string | null {
  return bytes ? utf8.decode(bytes) : null;
}
