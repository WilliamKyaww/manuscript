import { afterEach, describe, expect, it } from 'vitest';
import { createNotesTestbed, type NotesTestbed } from '../../../test/notes-helpers';

/** Phase 6: `[[Name]]` resolves to a concept when no note has that name (knowledge-system.md §3). */

let bed: NotesTestbed;
afterEach(() => bed?.cleanup());

const CAP = 'con_01J9Z3K4M2Q8R5T7V9X1Y3Z5D1';
const QUORUM = 'con_01J9Z3K4M2Q8R5T7V9X1Y3Z5D2';

/** Concept rows must exist before links may point at them (note_links.target_concept). */
function insertConcept(id: string, name: string) {
  bed.ctx.db.run(
    `INSERT INTO concepts (id, name, name_key, slug, created_at, updated_at)
     VALUES (?, ?, lower(?), lower(?), '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z')`,
    [id, name, name, name.replace(/\s+/g, '-')],
  );
}

function links(path: string) {
  const row = bed.repo.byPath(path);
  if (!row) throw new Error(`missing ${path}`);
  return bed.repo
    .linksFrom(row.docId)
    .map((link) => [link.targetRaw, link.targetKind, link.targetConcept]);
}

describe('links to concepts', () => {
  it('resolves names and aliases to concepts after notes, and follows concept changes', async () => {
    bed = createNotesTestbed();
    bed.write(
      'Distributed.md',
      '# Distributed\nSee [[CAP theorem]], [[Brewer]], [[Quorum]] and [[Raft]].',
    );
    bed.write('Raft.md', '# Raft');
    insertConcept(CAP, 'CAP theorem');
    insertConcept(QUORUM, 'Quorum');
    bed.indexer.setConcepts([
      { id: CAP, name: 'CAP theorem', aliases: ['Brewer'] },
      { id: QUORUM, name: 'Raft', aliases: ['Quorum'] },
    ]);
    await bed.indexer.scan();
    expect(links('Distributed.md')).toEqual([
      ['CAP theorem', 'concept', CAP],
      ['Brewer', 'concept', CAP],
      ['Quorum', 'concept', QUORUM],
      // A note with the name wins over a concept.
      ['Raft', 'note', null],
    ]);

    // Renaming a concept re-resolves existing links without re-reading the notes.
    bed.indexer.setConcepts([
      { id: CAP, name: 'CAP', aliases: [] },
      { id: QUORUM, name: 'Raft', aliases: ['Quorum'] },
    ]);
    expect(links('Distributed.md').slice(0, 2)).toEqual([
      ['CAP theorem', 'unresolved', null],
      ['Brewer', 'unresolved', null],
    ]);

    // A new note with a concept's name takes the links over.
    bed.write('Quorum.md', '# Quorum');
    bed.indexer.apply({ changed: ['Quorum.md'] }, 'external');
    expect(links('Distributed.md')[2]).toEqual(['Quorum', 'note', null]);

    bed.indexer.setConcepts([]);
    expect(links('Distributed.md').map((link) => link[1])).toEqual([
      'unresolved',
      'unresolved',
      'note',
      'note',
    ]);
  });

  it('keeps concept links when the index is rebuilt', async () => {
    bed = createNotesTestbed();
    bed.write('A.md', '[[CAP theorem]]');
    insertConcept(CAP, 'CAP theorem');
    bed.indexer.setConcepts([{ id: CAP, name: 'CAP theorem', aliases: [] }]);
    await bed.indexer.scan();
    bed.write('A.md', 'Edited: [[CAP theorem]] again.');
    bed.indexer.apply({ changed: ['A.md'] }, 'external');
    expect(links('A.md')).toEqual([['CAP theorem', 'concept', CAP]]);
  });
});
