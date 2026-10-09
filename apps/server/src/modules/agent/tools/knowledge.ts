import { ConflictError, idSchema, ValidationError } from '@skb/core';
import { formatWikilink, normaliseKey } from '@skb/core/markdown';
import { z } from 'zod';
import { findMentions } from '../../notes/mentions';
import { defineTool, type Json } from '../types';
import { clip, plain, rewriteNote } from './shared';

/**
 * Knowledge tools (task 12.05, agent-system.md §6.2): search, read and change notes. Every change
 * keeps a copy of the file first and can be put back unless the note changed since.
 */

const NoteId = idSchema('note');
const NOTE_CHARS = 12_000;

export const searchKnowledge = defineTool({
  name: 'search_knowledge',
  category: 'knowledge',
  description:
    'Search the student’s notes and source passages (slides, PDFs, documents, recordings) by words. Returns matching notes and passages with where they are. Filters work as in the search page: tag:, type:, folder:, module:, kind:note, kind:source. Use it before answering from the student’s material.',
  input: z.object({
    query: z.string().trim().min(1).max(300),
    limit: z.number().int().min(1).max(20).default(8),
  }),
  output: z.object({
    total: z.number().int(),
    results: z.array(
      z.object({
        kind: z.enum(['note', 'source']),
        id: z.string(),
        title: z.string(),
        where: z.string(),
        snippet: z.string(),
      }),
    ),
  }),
  risk: 'read',
  execute(context, input) {
    const found = context.services.search.search(input.query, { limit: input.limit, offset: 0 });
    return {
      output: {
        total: found.total,
        results: found.results.map((result) =>
          result.kind === 'note'
            ? {
                kind: 'note' as const,
                id: result.note.id,
                title: result.note.title,
                where: result.note.path,
                snippet: plain(result.snippet),
              }
            : {
                kind: 'source' as const,
                id: result.source.id,
                title: result.source.title,
                where: result.section.label,
                snippet: plain(result.snippet),
              },
        ),
      },
    };
  },
  describe: (input, output) =>
    output
      ? `Searched for “${input.query}”: ${output.total} match${output.total === 1 ? '' : 'es'}`
      : `Searching for “${input.query}”`,
});

export const getNote = defineTool({
  name: 'get_note',
  category: 'knowledge',
  description:
    'Read one note by id: its Markdown, headings, tags and the hash to pass to update_note. Long notes are cut; ask for a heading to read just that section.',
  input: z.object({
    id: NoteId,
    heading: z.string().trim().min(1).max(200).optional(),
  }),
  output: z.object({
    id: z.string(),
    title: z.string(),
    path: z.string(),
    hash: z.string(),
    tags: z.array(z.string()),
    headings: z.array(z.string()),
    content: z.string(),
    truncated: z.boolean(),
  }),
  risk: 'read',
  execute(context, input) {
    const note = context.services.notes.notes.get(input.id);
    let content = note.content;
    if (input.heading) {
      const wanted = input.heading.toLowerCase();
      const index = note.headings.findIndex((heading) => heading.text.toLowerCase() === wanted);
      const start = note.headings[index];
      if (!start) throw new ValidationError(`The note has no heading “${input.heading}”.`);
      const end = note.headings.slice(index + 1).find((heading) => heading.level <= start.level);
      content = note.content
        .split('\n')
        .slice(start.line - 1, end ? end.line - 1 : undefined)
        .join('\n')
        .trimEnd();
    }
    const cut = clip(content, NOTE_CHARS);
    return {
      output: {
        id: note.id,
        title: note.title,
        path: note.path,
        hash: note.hash,
        tags: note.tags,
        headings: note.headings.map((heading) => heading.text),
        content: cut.text,
        truncated: cut.truncated,
      },
    };
  },
  describe: (_input, output) => (output ? `Read the note “${output.title}”` : 'Reading a note'),
});

export const listNotes = defineTool({
  name: 'list_notes',
  category: 'knowledge',
  description:
    'List notes, optionally in one folder or with a word in the title. Returns ids, titles and paths, not contents.',
  input: z.object({
    folder: z.string().trim().max(500).optional(),
    titleContains: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(100).default(50),
  }),
  output: z.object({
    total: z.number().int(),
    notes: z.array(z.object({ id: z.string(), title: z.string(), path: z.string() })),
  }),
  risk: 'read',
  execute(context, input) {
    const prefix = input.folder ? `${input.folder.replace(/^\/+|\/+$/gu, '')}/` : '';
    const needle = input.titleContains?.toLowerCase();
    const matching = context.services.notes.notes
      .tree()
      .notes.filter(
        (note) =>
          note.path.startsWith(prefix) && (!needle || note.title.toLowerCase().includes(needle)),
      );
    return {
      output: {
        total: matching.length,
        notes: matching
          .slice(0, input.limit)
          .map((note) => ({ id: note.id, title: note.title, path: note.path })),
      },
    };
  },
  describe: (_input, output) => (output ? `Listed ${output.total} notes` : 'Listing notes'),
});

export const createNote = defineTool({
  name: 'create_note',
  category: 'knowledge',
  description:
    'Create a new Markdown note. Give a title, optionally a folder and the content (use [[Wikilinks]] to other notes and concepts). It never overwrites: a name that exists gets a number. Undo moves it to the trash.',
  input: z.object({
    title: z.string().trim().min(1).max(200),
    folder: z.string().trim().max(500).optional(),
    content: z.string().max(200_000).optional(),
    module: z.string().trim().max(100).optional(),
    lecture: z.string().trim().max(100).optional(),
  }),
  output: z.object({ id: z.string(), title: z.string(), path: z.string(), hash: z.string() }),
  risk: 'write',
  execute(context, input) {
    const note = context.services.notes.notes.create({
      title: input.title,
      ...(input.folder ? { folder: input.folder } : {}),
      content: input.content ?? '',
      ...(input.module ? { module: input.module } : {}),
      ...(input.lecture ? { lecture: input.lecture } : {}),
    });
    return {
      output: { id: note.id, title: note.title, path: note.path, hash: note.hash },
      undo: { noteId: note.id, hash: note.hash } as Json,
    };
  },
  describe: (input, output) => `Created the note “${output?.title ?? input.title}”`,
  canUndo(context, record) {
    const { noteId, hash } = record.undo as { noteId: string; hash: string };
    try {
      return context.services.notes.notes.get(noteId).hash === hash
        ? null
        : 'The note has been edited since it was created.';
    } catch {
      return 'The note no longer exists.';
    }
  },
  undo(context, record) {
    const { noteId } = record.undo as { noteId: string };
    const note = context.services.notes.notes.get(noteId);
    context.services.notes.entries.trash(note.path);
  },
});

/** The text of the section under a heading, as line numbers (1-based, end exclusive). */
function sectionLines(
  headings: readonly { level: number; text: string; line: number }[],
  heading: string,
  total: number,
): { start: number; end: number } {
  const index = headings.findIndex(
    (candidate) => candidate.text.toLowerCase() === heading.toLowerCase(),
  );
  const start = headings[index];
  if (!start) throw new ValidationError(`The note has no heading “${heading}”.`);
  const next = headings.slice(index + 1).find((candidate) => candidate.level <= start.level);
  return { start: start.line, end: next ? next.line : total + 1 };
}

export const updateNote = defineTool({
  name: 'update_note',
  category: 'knowledge',
  description:
    'Change an existing note. Pass the hash from get_note as baseHash: if the note changed since, nothing is written and you must read it again. mode "append" adds content at the end; "replace_section" replaces the text under a heading (the heading line is kept); "replace" replaces the whole note. Undo restores the previous text if the note has not been edited again.',
  input: z
    .object({
      id: NoteId,
      baseHash: z.string().min(1),
      mode: z.enum(['append', 'replace_section', 'replace']),
      heading: z.string().trim().min(1).max(200).optional(),
      content: z.string().max(200_000),
    })
    .refine((value) => value.mode !== 'replace_section' || value.heading, {
      message: 'replace_section needs the heading to replace.',
      path: ['heading'],
    }),
  output: z.object({ id: z.string(), path: z.string(), hash: z.string(), changed: z.boolean() }),
  risk: 'write',
  execute(context, input) {
    const result = rewriteNote(context, input.id, input.baseHash, (note) => {
      if (input.mode === 'replace') return input.content;
      if (input.mode === 'append')
        return `${note.content.replace(/\s+$/u, '')}\n\n${input.content.trim()}\n`;
      const lines = note.content.split('\n');
      const { start, end } = sectionLines(note.headings, input.heading ?? '', lines.length);
      return [...lines.slice(0, start), '', input.content.trim(), '', ...lines.slice(end - 1)].join(
        '\n',
      );
    });
    return {
      output: { id: input.id, path: result.path, hash: result.hash, changed: result.changed },
      undo: { noteId: input.id, before: result.before, afterHash: result.hash } as Json,
    };
  },
  describe: (input, output) =>
    `${output && !output.changed ? 'No change to' : 'Updated'} the note ${output?.path ?? input.id}`,
  canUndo(context, record) {
    const { noteId, afterHash } = record.undo as { noteId: string; afterHash: string };
    try {
      return context.services.notes.notes.get(noteId).hash === afterHash
        ? null
        : 'The note has been edited since this change.';
    } catch {
      return 'The note no longer exists.';
    }
  },
  undo(context, record) {
    const { noteId, before } = record.undo as { noteId: string; before: string | null };
    if (!before) throw new ConflictError('No earlier copy of the note was kept.');
    const current = context.services.notes.notes.get(noteId);
    context.services.notes.notes.update(noteId, {
      content: context.snapshots.read(before).toString('utf8'),
      baseHash: current.hash,
    });
  },
});

export const linkNotes = defineTool({
  name: 'link_notes',
  category: 'knowledge',
  description:
    'Link one note to another: turns the first plain mention of the target’s title in the source note into a [[wikilink]], or, if the title is not mentioned, lists the target under a “Related” heading at the end. Undo restores the source note if it has not been edited again.',
  input: z.object({ fromId: NoteId, toId: NoteId }),
  output: z.object({
    fromId: z.string(),
    toId: z.string(),
    how: z.enum(['mention', 'related', 'already-linked']),
    hash: z.string(),
  }),
  risk: 'write',
  execute(context, input) {
    if (input.fromId === input.toId) throw new ValidationError('A note cannot link to itself.');
    const notes = context.services.notes.notes;
    const target = notes.get(input.toId);
    const source = notes.get(input.fromId);
    const already = source.links.some(
      (link) => link.resolution.kind === 'note' && link.resolution.noteId === target.id,
    );
    if (already)
      return {
        output: {
          fromId: source.id,
          toId: target.id,
          how: 'already-linked' as const,
          hash: source.hash,
        },
      };
    let how: 'mention' | 'related' = 'related';
    const result = rewriteNote(context, input.fromId, null, (note) => {
      const mention = findMentions(note.content, [target.title])[0];
      if (mention) {
        how = 'mention';
        const link =
          normaliseKey(mention.text) === normaliseKey(target.title)
            ? formatWikilink({ target: mention.text })
            : formatWikilink({ target: target.title, alias: mention.text });
        return `${note.content.slice(0, mention.offset)}${link}${note.content.slice(mention.offset + mention.length)}`;
      }
      const lines = note.content.replace(/\s+$/u, '').split('\n');
      const item = `- ${formatWikilink({ target: target.title })}`;
      const heading = lines.findIndex((line) => /^##\s+Related\s*$/iu.test(line));
      if (heading === -1) lines.push('', '## Related', '', item);
      else {
        let end = heading + 1;
        while (end < lines.length && !/^#{1,2}\s/u.test(lines[end] ?? '')) end += 1;
        while (end > heading + 1 && !(lines[end - 1] ?? '').trim()) end -= 1;
        lines.splice(end, 0, item);
      }
      return `${lines.join('\n')}\n`;
    });
    return {
      output: { fromId: source.id, toId: target.id, how, hash: result.hash },
      undo: { noteId: source.id, before: result.before, afterHash: result.hash } as Json,
    };
  },
  describe: (_input, output) =>
    output?.how === 'already-linked' ? 'The notes were already linked' : 'Linked two notes',
  canUndo: (context, record) => updateNote.canUndo?.(context, record) ?? null,
  undo: (context, record) => updateNote.undo?.(context, record),
});

export const moveNote = defineTool({
  name: 'move_note',
  category: 'knowledge',
  description:
    'Move or rename one note to a new vault path ending in .md (folders are created); links to it in other notes are rewritten. Undo moves it back if it has not been moved again.',
  input: z.object({
    id: NoteId,
    to: z.string().trim().min(1).max(500).regex(/\.md$/iu, 'The new path must end in .md.'),
  }),
  output: z.object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    linksRewritten: z.number().int(),
  }),
  risk: 'write',
  execute(context, input) {
    const note = context.services.notes.notes.get(input.id);
    const result = context.services.notes.entries.move(note.path, input.to, true);
    return {
      output: {
        id: note.id,
        from: result.from,
        to: result.to,
        linksRewritten: result.rewritten.links,
      },
      undo: { noteId: note.id, from: result.from, to: result.to } as Json,
    };
  },
  describe: (_input, output) => (output ? `Moved ${output.from} to ${output.to}` : 'Moving a note'),
  canUndo(context, record) {
    const { noteId, to } = record.undo as { noteId: string; to: string };
    try {
      return context.services.notes.notes.get(noteId).path === to
        ? null
        : 'The note has been moved again since.';
    } catch {
      return 'The note no longer exists.';
    }
  },
  undo(context, record) {
    const { from, to } = record.undo as { from: string; to: string };
    context.services.notes.entries.move(to, from, true);
  },
});

export const deleteNote = defineTool({
  name: 'delete_note',
  category: 'knowledge',
  description:
    'Delete a note by moving it to the trash, where it stays recoverable for the retention period. Always needs the student’s approval.',
  input: z.object({ id: NoteId }),
  output: z.object({ id: z.string(), title: z.string(), path: z.string(), trashId: z.string() }),
  risk: 'destructive',
  execute(context, input) {
    const note = context.services.notes.notes.get(input.id);
    const item = context.services.notes.entries.trash(note.path);
    return {
      output: { id: note.id, title: note.title, path: note.path, trashId: item.id },
      undo: { trashId: item.id } as Json,
    };
  },
  describe: (input, output) => `Moved the note ${output?.title ?? input.id} to the trash`,
  canUndo(context, record) {
    const { trashId } = record.undo as { trashId: string };
    return context.services.notes.entries.listTrash().items.some((item) => item.id === trashId)
      ? null
      : 'The note is no longer in the trash.';
  },
  undo(context, record) {
    context.services.notes.entries.restore((record.undo as { trashId: string }).trashId);
  },
});

export const knowledgeTools = [
  searchKnowledge,
  getNote,
  listNotes,
  createNote,
  updateNote,
  linkNotes,
  moveNote,
  deleteNote,
];
