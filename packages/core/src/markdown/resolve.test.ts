import { describe, expect, it } from 'vitest';
import { linkTargetKey, normaliseKey, noteNameFromPath, sanitiseFileName } from './names';
import { LinkResolver, type ResolvableNote } from './resolve';

const note = (
  id: string,
  path: string,
  title = noteNameFromPath(path),
  aliases: string[] = [],
): ResolvableNote => ({
  id,
  path,
  title,
  aliases,
});

describe('names', () => {
  it('derives note names and link keys', () => {
    expect(noteNameFromPath('Modules/COC251/Paxos.md')).toBe('Paxos');
    expect(noteNameFromPath('Week 1\\Raft.MD')).toBe('Raft');
    expect(linkTargetKey('./Folder\\Note.md')).toBe('folder/note');
    expect(normaliseKey('  Café   au lait ')).toBe('café au lait');
    // NFD (as macOS writes file names) matches NFC.
    expect(normaliseKey('Café')).toBe(normaliseKey('Café'));
  });

  it('makes safe file names from titles', () => {
    expect(sanitiseFileName('Paxos: why? [draft] #1 | notes')).toBe(
      'Paxos- why- -draft- -1 - notes',
    );
    expect(sanitiseFileName('  ...  ')).toBe('Untitled');
    expect(sanitiseFileName('CON')).toBe('CON-note');
    expect(sanitiseFileName('trailing dots...')).toBe('trailing dots');
    expect(sanitiseFileName('x'.repeat(200))).toHaveLength(120);
  });
});

describe('LinkResolver', () => {
  const notes = [
    note('note_a', 'Paxos.md'),
    note('note_b', 'Modules/COC251/Paxos.md'),
    note('note_c', 'Modules/COC251/Raft.md', 'Raft consensus', ['Raft algorithm']),
    note('note_d', 'Inbox/Raft.md'),
    note('note_e', 'Ideas/Café.md'),
  ];
  const resolver = new LinkResolver(notes, [
    { path: 'Attachments/diagram.png' },
    { path: 'Modules/COC251/slides.pdf' },
  ]);

  it('prefers a note in the same folder, then the shortest path', () => {
    expect(resolver.resolve('Paxos', 'Modules/COC251/Index.md')).toMatchObject({
      kind: 'note',
      noteId: 'note_b',
      ambiguous: true,
    });
    expect(resolver.resolve('Paxos', 'Elsewhere/Note.md')).toMatchObject({
      kind: 'note',
      noteId: 'note_a',
    });
    expect(resolver.resolve('Raft')).toMatchObject({ kind: 'note', noteId: 'note_d' });
  });

  it('resolves path-qualified links by suffix', () => {
    expect(resolver.resolve('COC251/Paxos')).toMatchObject({
      kind: 'note',
      noteId: 'note_b',
      ambiguous: false,
    });
    expect(resolver.resolve('Modules/COC251/Raft.md')).toMatchObject({
      kind: 'note',
      noteId: 'note_c',
    });
  });

  it('falls back to titles and aliases, case-insensitively', () => {
    expect(resolver.resolve('raft CONSENSUS')).toMatchObject({ kind: 'note', noteId: 'note_c' });
    expect(resolver.resolve('Raft Algorithm')).toMatchObject({ kind: 'note', noteId: 'note_c' });
  });

  it('matches Unicode-normalised names', () => {
    expect(resolver.resolve('Café')).toMatchObject({ kind: 'note', noteId: 'note_e' });
  });

  it('resolves attachments by name or path', () => {
    expect(resolver.resolve('diagram.png')).toEqual({
      kind: 'attachment',
      path: 'Attachments/diagram.png',
      ambiguous: false,
    });
    expect(resolver.resolve('COC251/slides.pdf')).toMatchObject({
      kind: 'attachment',
      path: 'Modules/COC251/slides.pdf',
    });
  });

  it('resolves relative and root-absolute paths', () => {
    expect(resolver.resolve('../Inbox/Raft.md', 'Ideas/Note.md')).toMatchObject({
      noteId: 'note_d',
    });
    expect(resolver.resolve('./Raft', 'Modules/COC251/Index.md')).toMatchObject({
      noteId: 'note_c',
    });
    expect(resolver.resolve('COC251/Raft', 'Modules/Index.md')).toMatchObject({ noteId: 'note_c' });
    expect(resolver.resolve('slides.pdf', 'Modules/COC251/Index.md')).toMatchObject({
      kind: 'attachment',
    });
    expect(resolver.resolve('/Paxos', 'Modules/COC251/Index.md')).toMatchObject({
      noteId: 'note_a',
    });
    expect(resolver.resolve('../../../Paxos', 'Modules/Index.md')).toEqual({ kind: 'unresolved' });
  });

  it('resolves concepts after notes and before attachments', () => {
    const resolver = new LinkResolver(
      [note('n1', 'Modules/Raft.md')],
      [{ path: 'Attachments/CAP.png' }, { path: 'Attachments/Quorum' }],
      [
        { id: 'c1', name: 'Raft', aliases: [] },
        { id: 'c2', name: 'CAP theorem', aliases: ['CAP', 'Brewer’s theorem'] },
        { id: 'c3', name: 'Quorum', aliases: [] },
      ],
    );
    expect(resolver.conceptCount).toBe(3);
    // A note of the same name wins.
    expect(resolver.resolve('raft')).toMatchObject({ kind: 'note', noteId: 'n1' });
    expect(resolver.resolve('cap THEOREM')).toEqual({
      kind: 'concept',
      conceptId: 'c2',
      name: 'CAP theorem',
    });
    expect(resolver.resolve('Brewer’s theorem')).toMatchObject({
      kind: 'concept',
      conceptId: 'c2',
    });
    // Concepts come before attachments with the same name, but never match folder paths.
    expect(resolver.resolve('Quorum')).toMatchObject({ kind: 'concept', conceptId: 'c3' });
    expect(resolver.resolve('Attachments/Quorum')).toMatchObject({ kind: 'attachment' });
    expect(resolver.resolve('Modules/CAP theorem')).toEqual({ kind: 'unresolved' });

    resolver.setConcept({ id: 'c2', name: 'CAP', aliases: [] });
    expect(resolver.resolve('CAP theorem')).toEqual({ kind: 'unresolved' });
    resolver.removeConcept('c3');
    expect(resolver.resolve('Quorum')).toMatchObject({
      kind: 'attachment',
      path: 'Attachments/Quorum',
    });
  });

  it('can be updated in place', () => {
    const live = new LinkResolver([note('note_x', 'A/Topic.md')]);
    expect(live.resolve('Topic')).toMatchObject({ noteId: 'note_x' });
    live.setNote(note('note_x', 'B/Renamed.md', 'Renamed', ['Topic']));
    expect(live.resolve('Renamed')).toMatchObject({ noteId: 'note_x', path: 'B/Renamed.md' });
    expect(live.resolve('Topic')).toMatchObject({ noteId: 'note_x' });
    live.removeNote('note_x');
    expect(live.resolve('Renamed')).toEqual({ kind: 'unresolved' });
    live.setAttachment({ path: 'img/a.png' });
    expect(live.resolve('a.png')).toMatchObject({ kind: 'attachment' });
    live.removeAttachment('img/a.png');
    expect(live.resolve('a.png')).toEqual({ kind: 'unresolved' });
    expect(live.noteCount + live.attachmentCount).toBe(0);
  });

  it('finds the shortest link target that still resolves to a note', () => {
    expect(resolver.linkTargetFor('note_c', 'Inbox/Index.md')).toBe('COC251/Raft');
    expect(resolver.linkTargetFor('note_d', 'Inbox/Index.md')).toBe('Raft');
    expect(resolver.linkTargetFor('note_a', 'Modules/COC251/Index.md')).toBe('/Paxos');
    expect(resolver.linkTargetFor('note_b', 'Elsewhere.md')).toBe('COC251/Paxos');
    expect(resolver.linkTargetFor('missing')).toBeNull();
  });

  it('reports unresolved links', () => {
    expect(resolver.resolve('Byzantine generals')).toEqual({ kind: 'unresolved' });
    expect(resolver.resolve('')).toEqual({ kind: 'unresolved' });
    expect(resolver.resolve('Missing/Paxos')).toEqual({ kind: 'unresolved' });
  });
});
