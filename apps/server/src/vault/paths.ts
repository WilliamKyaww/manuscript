import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { VAULT_META_DIR, ValidationError } from '@skb/core';

/**
 * Path containment for everything that touches the vault (API, agent tools, importers).
 * Rules are deliberately stricter than any single filesystem so that a vault stays portable between
 * Windows, macOS and Linux and cannot be escaped (architecture.md §8).
 */

export interface ResolveOptions {
  /** Allow paths inside the `.skb/` metadata folder (internal callers only). */
  allowInternal?: boolean;
  /** Verify that no symbolic link or junction on the way escapes the vault (default true). */
  checkLinks?: boolean;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what we reject.
const INVALID_CHARACTERS = /[<>:"|?*\u0000-\u001f]/;

function invalid(reason: string, input: string): never {
  throw new ValidationError(`Invalid vault path "${input}": ${reason}.`, [
    { path: 'path', message: reason },
  ]);
}

/** Splits a vault-relative path into validated segments (accepts `/` or `\` separators). */
export function vaultPathSegments(relativePath: string, options: ResolveOptions = {}): string[] {
  if (typeof relativePath !== 'string' || relativePath.trim() === '')
    invalid('the path is empty', String(relativePath));
  if (relativePath.includes('\0')) invalid('it contains a NUL character', relativePath);
  if (
    /^[a-zA-Z]:/.test(relativePath) ||
    relativePath.startsWith('/') ||
    relativePath.startsWith('\\')
  ) {
    invalid('absolute paths are not allowed', relativePath);
  }

  const segments = relativePath
    .split(/[/\\]+/)
    .filter((segment) => segment !== '' && segment !== '.');
  if (segments.length === 0) invalid('the path is empty', relativePath);

  for (const segment of segments) {
    if (segment === '..') invalid('it may not contain ".." segments', relativePath);
    if (INVALID_CHARACTERS.test(segment))
      invalid(`"${segment}" contains characters that are not portable`, relativePath);
    if (/[. ]$/.test(segment)) invalid(`"${segment}" ends with a dot or space`, relativePath);
    const base = segment.split('.')[0] ?? segment;
    if (WINDOWS_RESERVED.test(base))
      invalid(`"${segment}" is a reserved device name on Windows`, relativePath);
  }

  if (!options.allowInternal && segments[0]?.toLowerCase() === VAULT_META_DIR) {
    invalid(`the ${VAULT_META_DIR} folder is reserved for the application`, relativePath);
  }
  return segments;
}

/** Resolves a vault-relative path to an absolute path guaranteed to stay inside `root`. */
export function resolveInVault(
  root: string,
  relativePath: string,
  options: ResolveOptions = {},
): string {
  const segments = vaultPathSegments(relativePath, options);
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absoluteRoot, ...segments);
  if (!isWithin(absoluteRoot, resolved)) invalid('it escapes the vault', relativePath);

  if (options.checkLinks !== false) {
    const realRoot = existsSync(absoluteRoot) ? realpathSync.native(absoluteRoot) : absoluteRoot;
    let probe = resolved;
    while (
      !existsSync(probe) &&
      isWithin(absoluteRoot, path.dirname(probe)) &&
      probe !== absoluteRoot
    ) {
      probe = path.dirname(probe);
    }
    if (existsSync(probe) && !isWithin(realRoot, realpathSync.native(probe))) {
      invalid('it passes through a link that leads outside the vault', relativePath);
    }
  }
  return resolved;
}

/** Converts an absolute path inside the vault to the portable, `/`-separated form we store. */
export function toVaultRelative(root: string, absolutePath: string): string {
  const absoluteRoot = path.resolve(root);
  const resolved = path.resolve(absolutePath);
  if (!isWithin(absoluteRoot, resolved) || resolved === absoluteRoot) {
    throw new ValidationError(`"${absolutePath}" is not inside the vault.`);
  }
  return path.relative(absoluteRoot, resolved).split(path.sep).join('/');
}

export function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
