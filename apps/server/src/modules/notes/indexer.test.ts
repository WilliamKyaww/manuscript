import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNotesTestbed, type NotesTestbed } from '../../../test/notes-helpers';

let bed: NotesTestbed;
afterEach(() => bed?.cleanup());

const NOTE_ID = /^note_[0-9A-HJKMNP-TV-Z]{26}$/;

/** Hash of every file in the vault (excluding .skb), to prove files were not touched. */
function snapshot(root: string): Map<string, string> {
  const result = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.skb') walk(full);
      } else {
        result.set(
          path.relative(root, full),
          createHash('sha256').update(readFileSync(full)).digest('hex'),
        );
      }
    }
  };
  walk(root);
  return result;
}

function linkTargets(sourcePath: string) {
  const row = bed.repo.byPath(sourcePath);
  if (!row) throw new Error(`missing ${sourcePath}`);
  return bed.repo
    .linksFrom(row.docId)
    .map((link) => ({ target: link.targetRaw, kind: link.targetKind, path: link.targetPath }));
}

describe('scanning', () => {
  it('indexes notes, attachments and folders and ignores application and tool folders', async () => {
    bed = createNotesTestbed();
    bed.write(
      'Paxos.md',
      '---\naliases: [Synod]\ntags: [consensus]\n---\n# Paxos\nSee [[Raft]] and ![[diagram.png]] #exam',
    );
    bed.write('Modules/COC251/Raft.md', '# Raft\nBased on [[Synod]]. Missing: [[Nowhere]].');
    bed.write('Attachments/diagram.png', new Uint8Array([137, 80, 78, 71]));
    bed.write('Sources/COC251/Lecture 1.md', '# An imported original');
    bed.write('.obsidian/workspace.json', '{}');
    bed.write('.hidden/Secret.md', '# hidden');
    bed.write('Modules/.Paxos.md.1234.0a1b2c3d.tmp', 'partial');
    bed.write('Empty/.keep', '');

    const result = await bed.indexer.scan();

    expect(bed.repo.all().map((row) => row.path)).toEqual(['Modules/COC251/Raft.md', 'Paxos.md']);
    expect(bed.repo.allAttachments().map((row) => row.path)).toEqual([
      'Attachments/diagram.png',
      'Sources/COC251/Lecture 1.md',
    ]);
    expect(bed.indexer.folders()).toEqual([
      'Attachments',
      'Empty',
      'Modules',
      'Modules/COC251',
      'Sources',
      'Sources/COC251',
    ]);
    expect(linkTargets('Paxos.md')).toEqual([
      { target: 'Raft', kind: 'note', path: 'Modules/COC251/Raft.md' },
      { target: 'diagram.png', kind: 'attachment', path: 'Attachments/diagram.png' },
    ]);
    expect(linkTargets('Modules/COC251/Raft.md')).toEqual([
      { target: 'Synod', kind: 'note', path: 'Paxos.md' },
      { target: 'Nowhere', kind: 'unresolved', path: null },
    ]);
    expect(bed.repo.tags(bed.repo.byPath('Paxos.md')?.docId ?? 0)).toEqual(['consensus', 'exam']);
    expect(bed.idOf('Paxos.md')).toMatch(NOTE_ID);
    expect(result.notes.map((change) => change.kind)).toEqual(['created', 'created']);
    expect(bed.indexer.status()).toMatchObject({ state: 'ready', notes: 2, attachments: 2 });
  });

  it('does not modify any file when ids are assigned on demand (the default)', async () => {
    bed = createNotesTestbed();
    bed.write('A.md', '---\ntitle: "A"   # comment\n---\nText [[B]]\r\n');
    bed.write('B.md', 'No frontmatter');
    bed.write('C.md', '---\nid: 202310041305\n---\nZettelkasten id');
    const before = snapshot(bed.vaultRoot);
    await bed.indexer.scan();
    expect(snapshot(bed.vaultRoot)).toEqual(before);
    expect(bed.repo.byPath('A.md')?.idPersisted).toBe(false);
    expect(JSON.parse(bed.repo.byPath('C.md')?.warningsJson ?? '[]')).toEqual([
      expect.objectContaining({ code: 'foreign-id' }),
    ]);
  });

  it('writes ids into files when configured to assign them on index', async () => {
    bed = createNotesTestbed();
    bed.settings.updateNotes({ assignIds: 'on-index' });
    bed.write('A.md', '---\ntitle: A # keep me\n---\nBody');
    bed.write('B.md', 'Body only');
    bed.write('C.md', '---\nid: 42\n---\nForeign id');
    bed.write('Broken.md', '---\ntitle: [unclosed\n---\nBody');
    await bed.indexer.scan();

    const a = bed.idOf('A.md');
    expect(bed.read('A.md')).toBe(`---\nid: ${a}\ntitle: A # keep me\n---\nBody`);
    expect(bed.read('B.md')).toBe(`---\nid: ${bed.idOf('B.md')}\n---\nBody only`);
    expect(bed.read('C.md')).toBe(`---\nskb-id: ${bed.idOf('C.md')}\nid: 42\n---\nForeign id`);
    expect(bed.read('Broken.md')).toBe('---\ntitle: [unclosed\n---\nBody');
    expect(bed.repo.byPath('A.md')?.idPersisted).toBe(true);
    expect(bed.repo.byPath('Broken.md')?.idPersisted).toBe(false);
  });

  it('skips unchanged files on a second scan and picks up changes made while closed', async () => {
    bed = createNotesTestbed();
    bed.write('A.md', 'one');
    bed.write('B.md', 'two');
    await bed.indexer.scan();
    const before = bed.repo.byPath('A.md');
    bed.clock.advance(60_000);
    bed.write('B.md', 'two, edited [[A]]');
    const result = await bed.indexer.scan();
    expect(bed.repo.byPath('A.md')?.indexedAt).toBe(before?.indexedAt);
    expect(result.notes).toEqual([expect.objectContaining({ kind: 'updated', path: 'B.md' })]);
    expect(linkTargets('B.md')).toEqual([{ target: 'A', kind: 'note', path: 'A.md' }]);
  });

  it('rebuilds the index from files, keeping persisted ids', async () => {
    bed = createNotesTestbed();
    bed.write('Kept.md', '---\nid: note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7\n---\nBody');
    await bed.indexer.scan();
    bed.ctx.db.exec('DELETE FROM notes');
    await bed.indexer.scan();
    expect(bed.idOf('Kept.md')).toBe('note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7');
  });

  it('reports files that are not UTF-8 as read-only', async () => {
    bed = createNotesTestbed();
    bed.write('Latin1.md', new Uint8Array([0x63, 0x61, 0x66, 0xe9]));
    await bed.indexer.scan();
    expect(JSON.parse(bed.repo.byPath('Latin1.md')?.warningsJson ?? '[]')).toEqual([
      expect.objectContaining({ code: 'not-utf8' }),
    ]);
  });
});

describe('identity across moves and copies', () => {
  it('keeps the id of a note moved outside the app (no persisted id: matched by content)', async () => {
    bed = createNotesTestbed();
    bed.write('Inbox/Idea.md', 'An idea');
    bed.write('Other.md', 'Links to [[Idea]]');
    await bed.indexer.scan();
    const id = bed.idOf('Inbox/Idea.md');
    bed.move('Inbox/Idea.md', 'Ideas/Better name.md');
    const result = bed.indexer.apply(
      { removed: ['Inbox/Idea.md'], changed: ['Ideas/Better name.md'] },
      'external',
    );
    expect(bed.idOf('Ideas/Better name.md')).toBe(id);
    expect(result.notes).toEqual([
      expect.objectContaining({
        kind: 'moved',
        from: 'Inbox/Idea.md',
        path: 'Ideas/Better name.md',
      }),
    ]);
    expect(linkTargets('Other.md')).toEqual([{ target: 'Idea', kind: 'unresolved', path: null }]);
  });

  it('keeps a persisted id across a move detected by a full scan', async () => {
    bed = createNotesTestbed();
    bed.write('A.md', '---\nid: note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7\n---\nEdited later');
    await bed.indexer.scan();
    bed.move('A.md', 'Moved/A2.md');
    bed.write('Moved/A2.md', '---\nid: note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7\n---\nEdited after moving');
    await bed.indexer.scan();
    expect(bed.repo.all().map((row) => [row.path, row.id])).toEqual([
      ['Moved/A2.md', 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7'],
    ]);
  });

  it('treats a case-only rename as a move, not a copy', async () => {
    bed = createNotesTestbed();
    bed.write('note.md', '---\nid: note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7\n---\nBody');
    await bed.indexer.scan();
    bed.move('note.md', 'Note.md');
    bed.indexer.apply({ removed: ['note.md'], changed: ['Note.md'] }, 'external');
    expect(bed.repo.all().map((row) => [row.path, row.id])).toEqual([
      ['Note.md', 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7'],
    ]);
    expect(bed.read('Note.md')).toContain('note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7');
  });

  it('gives a copied file a new id and writes it into the copy only', async () => {
    bed = createNotesTestbed();
    const original = '---\nid: note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7\ntitle: Original\n---\nBody';
    bed.write('Original.md', original);
    await bed.indexer.scan();
    bed.clock.advance(1000);
    bed.write('Copy.md', original);
    bed.indexer.apply({ changed: ['Copy.md'] }, 'external');

    const copyId = bed.idOf('Copy.md');
    expect(copyId).not.toBe('note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7');
    expect(bed.read('Original.md')).toBe(original);
    expect(bed.read('Copy.md')).toBe(`---\nid: ${copyId}\ntitle: Original\n---\nBody`);
    expect(JSON.parse(bed.repo.byPath('Copy.md')?.warningsJson ?? '[]')).toEqual([
      expect.objectContaining({ code: 'duplicate-id' }),
    ]);
  });
});

describe('incremental changes and link re-resolution', () => {
  it('resolves links when their target appears and unresolves them when it goes', async () => {
    bed = createNotesTestbed();
    bed.write('Index.md', '[[Byzantine generals]] and [[Topics/Faults]]');
    await bed.indexer.scan();
    expect(linkTargets('Index.md').map((link) => link.kind)).toEqual(['unresolved', 'unresolved']);

    bed.write('Topics/Faults.md', '---\naliases: [Byzantine generals]\n---\n# Faults');
    bed.indexer.apply({ changed: ['Topics/Faults.md'], addedFolders: ['Topics'] }, 'external');
    expect(linkTargets('Index.md').map((link) => link.path)).toEqual([
      'Topics/Faults.md',
      'Topics/Faults.md',
    ]);
    expect(bed.indexer.folders()).toContain('Topics');

    bed.write('Topics/Faults.md', '# Faults (alias removed)');
    bed.indexer.apply({ changed: ['Topics/Faults.md'] }, 'external');
    expect(linkTargets('Index.md').map((link) => link.kind)).toEqual(['unresolved', 'note']);

    bed.remove('Topics');
    const result = bed.indexer.apply({ removedFolders: ['Topics'] }, 'external');
    expect(linkTargets('Index.md').map((link) => link.kind)).toEqual(['unresolved', 'unresolved']);
    expect(result.notes).toEqual([
      expect.objectContaining({ kind: 'deleted', path: 'Topics/Faults.md' }),
    ]);
    expect(bed.indexer.folders()).not.toContain('Topics');
  });

  it('prefers a note in the same folder and re-resolves when a closer note appears', async () => {
    bed = createNotesTestbed();
    bed.write('Paxos.md', 'root');
    bed.write('COC251/Index.md', '[[Paxos]]');
    await bed.indexer.scan();
    expect(linkTargets('COC251/Index.md')[0]?.path).toBe('Paxos.md');
    bed.write('COC251/Paxos.md', 'module copy');
    bed.indexer.apply({ changed: ['COC251/Paxos.md'] }, 'external');
    expect(linkTargets('COC251/Index.md')[0]?.path).toBe('COC251/Paxos.md');
  });

  it('is idempotent: re-applying an unchanged file publishes nothing', async () => {
    bed = createNotesTestbed();
    bed.write('A.md', 'text');
    await bed.indexer.scan();
    bed.events.length = 0;
    expect(bed.indexer.apply({ changed: ['A.md'] }, 'external')).toEqual({
      notes: [],
      structure: false,
    });
    expect(bed.events).toEqual([]);
  });

  it('treats a removed path that still exists as a change', async () => {
    bed = createNotesTestbed();
    bed.write('A.md', 'one');
    await bed.indexer.scan();
    const id = bed.idOf('A.md');
    bed.write('A.md', 'two');
    bed.indexer.apply({ removed: ['A.md'] }, 'external');
    expect(bed.idOf('A.md')).toBe(id);
    expect(bed.repo.byPath('A.md')?.wordCount).toBe(1);
  });

  it('drops notes that a new ignore pattern excludes', async () => {
    bed = createNotesTestbed();
    bed.write('Archive/Old.md', 'old');
    bed.write('Current.md', 'current');
    await bed.indexer.scan();
    bed.settings.updateNotes({ ignorePatterns: ['Archive/'] });
    await bed.indexer.whenIdle();
    expect(bed.repo.all().map((row) => row.path)).toEqual(['Current.md']);
    expect(bed.indexer.folders()).toEqual([]);
  });
});

describe('ensurePersistentId', () => {
  it('writes the id as the first frontmatter key and keeps the rest of the file', async () => {
    bed = createNotesTestbed();
    bed.write('A.md', '---\ntitle: A # comment\n---\r\nBody\r\n');
    bed.write('Z.md', '---\nid: 20231004\n---\nZettel');
    await bed.indexer.scan();
    const row = bed.indexer.ensurePersistentId(bed.idOf('A.md'));
    expect(row.idPersisted).toBe(true);
    expect(bed.read('A.md')).toBe(`---\nid: ${row.id}\ntitle: A # comment\n---\r\nBody\r\n`);
    const zettel = bed.indexer.ensurePersistentId(bed.idOf('Z.md'));
    expect(bed.read('Z.md')).toBe(`---\nskb-id: ${zettel.id}\nid: 20231004\n---\nZettel`);
  });

  it('refuses to touch invalid frontmatter', async () => {
    bed = createNotesTestbed();
    bed.write('Bad.md', '---\na: [\n---\nBody');
    await bed.indexer.scan();
    expect(() => bed.indexer.ensurePersistentId(bed.idOf('Bad.md'))).toThrow(/not valid YAML/);
    expect(bed.read('Bad.md')).toBe('---\na: [\n---\nBody');
  });
});

describe('events', () => {
  it('publishes progress and changes', async () => {
    bed = createNotesTestbed();
    for (let index = 0; index < 7; index += 1) bed.write(`N${index}.md`, `note ${index}`);
    await bed.indexer.scan();
    const statuses = bed.events.flatMap((event) =>
      event.type === 'index.status' ? [event.status.state] : [],
    );
    expect(statuses[0]).toBe('scanning');
    expect(statuses.at(-1)).toBe('ready');
    expect(bed.vaultChanges()).toHaveLength(7);
    expect(statSync(bed.abs('N0.md')).isFile()).toBe(true);
  });
});
