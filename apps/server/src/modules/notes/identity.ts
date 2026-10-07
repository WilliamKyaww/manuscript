import { isId } from '@skb/core';
import { FrontmatterEditError, setFrontmatterValues } from '@skb/core/markdown';

/**
 * Note identity in frontmatter (ADR-0025). The application's id lives in `id`; if a note already uses
 * `id` for something else (a Zettelkasten number, say), that value is left untouched and the
 * application uses `skb-id` instead. Only these keys are ever written automatically.
 */

export const ID_KEY = 'id';
export const FALLBACK_ID_KEY = 'skb-id';

export interface PersistedId {
  id: string;
  key: typeof ID_KEY | typeof FALLBACK_ID_KEY;
}

/** The note id stored in frontmatter, if any. */
export function persistedIdOf(frontmatter: Readonly<Record<string, unknown>>): PersistedId | null {
  for (const key of [ID_KEY, FALLBACK_ID_KEY] as const) {
    const value = frontmatter[key];
    if (typeof value === 'string' && isId(value.trim(), 'note')) return { id: value.trim(), key };
  }
  return null;
}

/** True when `id` holds a value that is not ours (so we must not overwrite it). */
export function hasForeignId(frontmatter: Readonly<Record<string, unknown>>): boolean {
  const value = frontmatter[ID_KEY];
  return (
    value !== undefined &&
    value !== null &&
    !(typeof value === 'string' && isId(value.trim(), 'note'))
  );
}

/** Which key to write the application id under for a note with this frontmatter. */
export function idKeyFor(frontmatter: Readonly<Record<string, unknown>>): PersistedId['key'] {
  return hasForeignId(frontmatter) ? FALLBACK_ID_KEY : ID_KEY;
}

/**
 * Returns `text` with the id written into its frontmatter (as the first key when it is new), or null
 * if the frontmatter is not valid YAML (we never risk corrupting a file to add an id).
 */
export function withPersistedId(
  text: string,
  frontmatter: Readonly<Record<string, unknown>>,
  id: string,
): string | null {
  try {
    return setFrontmatterValues(text, { [idKeyFor(frontmatter)]: id }, { position: 'start' });
  } catch (error) {
    if (error instanceof FrontmatterEditError) return null;
    throw error;
  }
}
