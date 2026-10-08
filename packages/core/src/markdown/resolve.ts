import {
  folderOf,
  linkTargetKey,
  normaliseKey,
  noteNameFromPath,
  notePathKey,
  toPortablePath,
} from './names';

/**
 * Wikilink and Markdown-link resolution (knowledge-system.md §3), shared by the server index and the
 * editor so both resolve links identically. Matching is case-insensitive and Unicode-normalised.
 *
 * Path-qualified targets (`Folder/Note`, `../Note.md`, `/Note`):
 *   1. relative to the linking note's folder (standard Markdown semantics; not for `/…`);
 *   2. from the vault root;
 *   3. by path suffix (`COC251/Paxos` matches `Modules/COC251/Paxos.md`).
 * Bare names (`Note`):
 *   1. a note whose file name equals the target;
 *   2. a note whose frontmatter `title` equals the target;
 *   3. a note alias;
 *   4. a concept by name or alias (Phase 6; folder-qualified targets never match concepts);
 *   5. an attachment (any non-note file) by file name.
 * Several candidates at one step prefer the linking note's own folder, then the shortest path, and
 * are reported as ambiguous. Concept names and aliases are unique, so a concept is never ambiguous.
 */

export interface ResolvableNote {
  id: string;
  path: string;
  title: string;
  aliases: readonly string[];
}

export interface ResolvableAttachment {
  path: string;
}

export interface ResolvableConcept {
  id: string;
  name: string;
  aliases: readonly string[];
}

export type LinkResolution =
  | { kind: 'note'; noteId: string; path: string; ambiguous: boolean }
  | { kind: 'attachment'; path: string; ambiguous: boolean }
  | { kind: 'concept'; conceptId: string; name: string }
  | { kind: 'unresolved' };

interface NoteEntry {
  note: ResolvableNote;
  pathKey: string;
  folderKey: string;
  keys: { name: string; title: string; aliases: string[] };
}

interface AttachmentEntry {
  attachment: ResolvableAttachment;
  pathKey: string;
  nameKey: string;
  folderKey: string;
}

/** A multimap whose buckets keep insertion order and support removal. */
class KeyIndex<V> {
  readonly #map = new Map<string, Set<V>>();

  add(key: string, value: V): void {
    const bucket = this.#map.get(key);
    if (bucket) bucket.add(value);
    else this.#map.set(key, new Set([value]));
  }

  delete(key: string, value: V): void {
    const bucket = this.#map.get(key);
    if (!bucket) return;
    bucket.delete(value);
    if (bucket.size === 0) this.#map.delete(key);
  }

  get(key: string): V[] {
    const bucket = this.#map.get(key);
    return bucket ? [...bucket] : [];
  }
}

/** Comparison key for attachment paths (extensions are significant, unlike note paths). */
export function attachmentPathKey(path: string): string {
  return normaliseKey(toPortablePath(path));
}

/**
 * Resolves `.` and `..` segments of `target` against the vault folder `folder`.
 * Returns null when the result would climb above the vault root.
 */
export function joinVaultPath(folder: string, target: string): string | null {
  const segments = folder === '' ? [] : toPortablePath(folder).split('/');
  for (const part of target.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(part);
    }
  }
  return segments.join('/');
}

function comparePaths(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

export class LinkResolver {
  readonly #notes = new Map<string, NoteEntry>();
  readonly #attachments = new Map<string, AttachmentEntry>();
  readonly #byName = new KeyIndex<NoteEntry>();
  readonly #byPath = new KeyIndex<NoteEntry>();
  readonly #byTitle = new KeyIndex<NoteEntry>();
  readonly #byAlias = new KeyIndex<NoteEntry>();
  readonly #attachmentsByName = new KeyIndex<AttachmentEntry>();
  readonly #attachmentsByPath = new KeyIndex<AttachmentEntry>();
  readonly #concepts = new Map<string, { concept: ResolvableConcept; keys: string[] }>();
  readonly #conceptsByKey = new Map<string, ResolvableConcept>();

  constructor(
    notes: readonly ResolvableNote[] = [],
    attachments: readonly ResolvableAttachment[] = [],
    concepts: readonly ResolvableConcept[] = [],
  ) {
    for (const note of notes) this.setNote(note);
    for (const attachment of attachments) this.setAttachment(attachment);
    for (const concept of concepts) this.setConcept(concept);
  }

  get noteCount(): number {
    return this.#notes.size;
  }

  get attachmentCount(): number {
    return this.#attachments.size;
  }

  get conceptCount(): number {
    return this.#concepts.size;
  }

  getNote(id: string): ResolvableNote | undefined {
    return this.#notes.get(id)?.note;
  }

  /** Adds or replaces a note (matched by id). */
  setNote(note: ResolvableNote): void {
    this.removeNote(note.id);
    const entry: NoteEntry = {
      note: { ...note, aliases: [...note.aliases] },
      pathKey: notePathKey(note.path),
      folderKey: normaliseKey(folderOf(note.path)),
      keys: {
        name: normaliseKey(noteNameFromPath(note.path)),
        title: normaliseKey(note.title),
        aliases: [...new Set(note.aliases.map(normaliseKey).filter((alias) => alias !== ''))],
      },
    };
    this.#notes.set(note.id, entry);
    this.#byName.add(entry.keys.name, entry);
    this.#byPath.add(entry.pathKey, entry);
    if (entry.keys.title !== '') this.#byTitle.add(entry.keys.title, entry);
    for (const alias of entry.keys.aliases) this.#byAlias.add(alias, entry);
  }

  removeNote(id: string): void {
    const entry = this.#notes.get(id);
    if (!entry) return;
    this.#notes.delete(id);
    this.#byName.delete(entry.keys.name, entry);
    this.#byPath.delete(entry.pathKey, entry);
    this.#byTitle.delete(entry.keys.title, entry);
    for (const alias of entry.keys.aliases) this.#byAlias.delete(alias, entry);
  }

  setAttachment(attachment: ResolvableAttachment): void {
    const pathKey = attachmentPathKey(attachment.path);
    this.removeAttachment(attachment.path);
    const portable = toPortablePath(attachment.path);
    const entry: AttachmentEntry = {
      attachment: { ...attachment },
      pathKey,
      nameKey: normaliseKey(portable.slice(portable.lastIndexOf('/') + 1)),
      folderKey: normaliseKey(folderOf(portable)),
    };
    this.#attachments.set(pathKey, entry);
    this.#attachmentsByName.add(entry.nameKey, entry);
    this.#attachmentsByPath.add(pathKey, entry);
  }

  removeAttachment(path: string): void {
    const pathKey = attachmentPathKey(path);
    const entry = this.#attachments.get(pathKey);
    if (!entry) return;
    this.#attachments.delete(pathKey);
    this.#attachmentsByName.delete(entry.nameKey, entry);
    this.#attachmentsByPath.delete(pathKey, entry);
  }

  /** Adds or replaces a concept (matched by id). Its name and aliases become link targets. */
  setConcept(concept: ResolvableConcept): void {
    this.removeConcept(concept.id);
    const keys = [...new Set([concept.name, ...concept.aliases].map(normaliseKey))].filter(
      (key) => key !== '',
    );
    const entry = { concept: { ...concept, aliases: [...concept.aliases] }, keys };
    this.#concepts.set(concept.id, entry);
    for (const key of keys)
      if (!this.#conceptsByKey.has(key)) this.#conceptsByKey.set(key, entry.concept);
  }

  removeConcept(id: string): void {
    const entry = this.#concepts.get(id);
    if (!entry) return;
    this.#concepts.delete(id);
    for (const key of entry.keys) {
      if (this.#conceptsByKey.get(key)?.id === id) this.#conceptsByKey.delete(key);
    }
  }

  /** Resolves a link target (without `#heading`) written in the note at `sourcePath`. */
  resolve(target: string, sourcePath?: string): LinkResolution {
    const trimmed = target.trim();
    const rootAbsolute = /^[/\\]/.test(trimmed);
    const key = linkTargetKey(trimmed);
    if (key === '') return { kind: 'unresolved' };
    const sourceFolder = sourcePath === undefined ? null : normaliseKey(folderOf(sourcePath));

    if (rootAbsolute || key.includes('/')) {
      if (!rootAbsolute && sourcePath !== undefined) {
        const joined = joinVaultPath(folderOf(sourcePath), trimmed);
        if (joined !== null && joined !== '') {
          const relative = this.#exactPath(joined, sourceFolder);
          if (relative) return relative;
        }
      }
      const fromRoot = this.#exactPath(toPortablePath(trimmed), sourceFolder);
      if (fromRoot) return fromRoot;
      if (key.startsWith('../') || rootAbsolute) return { kind: 'unresolved' };

      const suffix = `/${key}`;
      const notes = [...this.#notes.values()].filter((entry) => entry.pathKey.endsWith(suffix));
      if (notes.length > 0) return this.#pickNote(notes, sourceFolder);
      const attachmentSuffix = `/${attachmentPathKey(trimmed)}`;
      const attachments = [...this.#attachments.values()].filter((entry) =>
        entry.pathKey.endsWith(attachmentSuffix),
      );
      if (attachments.length > 0) return this.#pickAttachment(attachments, sourceFolder);
      return { kind: 'unresolved' };
    }

    for (const index of [this.#byName, this.#byTitle, this.#byAlias]) {
      const candidates = index.get(key);
      if (candidates.length > 0) return this.#pickNote(candidates, sourceFolder);
    }
    const concept = this.#conceptsByKey.get(key);
    if (concept) return { kind: 'concept', conceptId: concept.id, name: concept.name };
    const attachments = this.#attachmentsByName.get(attachmentPathKey(trimmed));
    if (attachments.length > 0) return this.#pickAttachment(attachments, sourceFolder);
    return { kind: 'unresolved' };
  }

  /**
   * The shortest wikilink target that resolves to `noteId` from `sourcePath`: the note's name, then
   * as many parent folders as needed, then a root-absolute path. Null for an unknown note.
   */
  linkTargetFor(noteId: string, sourcePath?: string): string | null {
    const entry = this.#notes.get(noteId);
    if (!entry) return null;
    const resolvesHere = (candidate: string) => {
      const result = this.resolve(candidate, sourcePath);
      return result.kind === 'note' && result.noteId === noteId;
    };
    const segments = toPortablePath(entry.note.path).replace(/\.md$/i, '').split('/');
    for (let start = segments.length - 1; start >= 0; start -= 1) {
      const candidate = segments.slice(start).join('/');
      if (resolvesHere(candidate)) return candidate;
    }
    return `/${segments.join('/')}`;
  }

  #exactPath(path: string, sourceFolder: string | null): LinkResolution | null {
    const notes = this.#byPath.get(linkTargetKey(path));
    if (notes.length > 0) return this.#pickNote(notes, sourceFolder);
    const attachments = this.#attachmentsByPath.get(attachmentPathKey(path));
    if (attachments.length > 0) return this.#pickAttachment(attachments, sourceFolder);
    return null;
  }

  #pickNote(candidates: readonly NoteEntry[], sourceFolder: string | null): LinkResolution {
    const chosen = pick(candidates, sourceFolder, (entry) => entry.note.path);
    return {
      kind: 'note',
      noteId: chosen.note.id,
      path: chosen.note.path,
      ambiguous: candidates.length > 1,
    };
  }

  #pickAttachment(
    candidates: readonly AttachmentEntry[],
    sourceFolder: string | null,
  ): LinkResolution {
    const chosen = pick(candidates, sourceFolder, (entry) => entry.attachment.path);
    return { kind: 'attachment', path: chosen.attachment.path, ambiguous: candidates.length > 1 };
  }
}

function pick<T extends { folderKey: string }>(
  candidates: readonly T[],
  sourceFolder: string | null,
  pathOf: (candidate: T) => string,
): T {
  const sorted = [...candidates].sort((a, b) => comparePaths(pathOf(a), pathOf(b)));
  const sameFolder =
    sourceFolder === null ? undefined : sorted.find((entry) => entry.folderKey === sourceFolder);
  const chosen = sameFolder ?? sorted[0];
  if (!chosen) throw new Error('pick() needs at least one candidate.');
  return chosen;
}
