import { ConflictError, UNTRUSTED_RULE, wrapUntrusted } from '@skb/core';
import type { ToolContext } from '../types';

/** Pieces shared by the tools. */

/** "1 note", "3 notes": a number with its noun, for activity lines. */
export const count = (n: number, singular: string, plural = `${singular}s`) =>
  `${n} ${n === 1 ? singular : plural}`;

export const plain = (parts: readonly { text: string }[]) =>
  parts
    .map((part) => part.text)
    .join('')
    .replace(/\s+/gu, ' ')
    .trim();

export function clip(text: string, max: number): { text: string; truncated: boolean } {
  return text.length <= max
    ? { text, truncated: false }
    : { text: `${text.slice(0, max).trimEnd()} …`, truncated: true };
}

/**
 * Text from the student's files as the model should see it: wrapped as data it must not obey
 * (agent-system.md §10), with sentinels neutralised. Every tool that returns file or source text
 * goes through this, so injected instructions arrive labelled as material, never as commands.
 */
export function untrusted(key: string, title: string, location: string, text: string): string {
  return wrapUntrusted({ key, title, location, text });
}

export { UNTRUSTED_RULE };

/**
 * Rewrites a note's text on the agent's behalf: keeps a copy of the file first and refuses if the
 * note changed since it was read (the hash). Returns what an undo needs.
 */
export function rewriteNote(
  context: ToolContext,
  noteId: string,
  baseHash: string | null,
  transform: (current: {
    content: string;
    headings: readonly { level: number; text: string; line: number }[];
  }) => string,
) {
  const notes = context.services.notes.notes;
  const note = notes.get(noteId);
  if (baseHash !== null && note.hash !== baseHash)
    throw new ConflictError(
      'The note has changed since it was read. Read it again, then make the change.',
    );
  const next = transform(note);
  const before = context.snapshot.file(note.path);
  const updated = notes.update(noteId, { content: next, baseHash: baseHash ?? note.hash });
  return { path: updated.path, hash: updated.hash, before, changed: next !== note.content };
}
