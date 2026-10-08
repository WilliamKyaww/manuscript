import { describe, expect, it } from 'vitest';
import { ancestorsOf, buildTree, visibleNodes } from './buildTree';

const data = {
  notes: [
    { id: 'n1', path: 'Week 10/Notes.md', title: 'Notes', type: null, aliases: [], updatedAt: '' },
    { id: 'n2', path: 'Week 2/Notes.md', title: 'Notes', type: null, aliases: [], updatedAt: '' },
    { id: 'n3', path: 'b.md', title: 'B', type: null, aliases: [], updatedAt: '' },
    { id: 'n4', path: 'A.md', title: 'Title of A', type: null, aliases: [], updatedAt: '' },
    { id: 'n5', path: 'Deep/Er/Est.md', title: 'Est', type: null, aliases: [], updatedAt: '' },
  ],
  folders: ['Week 2', 'Week 10', 'Empty', 'Deep', 'Deep/Er'],
  attachments: [
    { path: 'Week 2/diagram.png', sizeBytes: 1, mediaType: 'image/png', updatedAt: '' },
  ],
};

describe('buildTree', () => {
  it('nests folders first, sorted naturally, then notes by file name', () => {
    const root = buildTree(data, { attachments: false });
    expect(root.children.map((node) => `${node.kind}:${node.name}`)).toEqual([
      'folder:Deep',
      'folder:Empty',
      'folder:Week 2',
      'folder:Week 10',
      'note:A',
      'note:b',
    ]);
  });

  it('includes attachments only when asked', () => {
    const week2 = (attachments: boolean) =>
      buildTree(data, { attachments }).children.find((node) => node.name === 'Week 2');
    const names = (attachments: boolean) => {
      const folder = week2(attachments);
      return folder?.kind === 'folder' ? folder.children.map((node) => node.name) : [];
    };
    expect(names(false)).toEqual(['Notes']);
    expect(names(true)).toEqual(['diagram.png', 'Notes']);
  });

  it('creates missing parent folders', () => {
    const deep = data.notes.filter((note) => note.path.startsWith('Deep/'));
    const root = buildTree({ notes: deep, folders: [], attachments: [] }, { attachments: false });
    expect(
      visibleNodes(root, new Set(['Deep', 'Deep/Er'])).map((row) => [row.node.path, row.depth]),
    ).toEqual([
      ['Deep', 1],
      ['Deep/Er', 2],
      ['Deep/Er/Est.md', 3],
    ]);
  });
});

describe('visibleNodes', () => {
  it('lists only the contents of expanded folders, with positions', () => {
    const root = buildTree(data, { attachments: false });
    const rows = visibleNodes(root, new Set(['Week 2']));
    expect(rows.map((row) => row.node.path)).toEqual([
      'Deep',
      'Empty',
      'Week 2',
      'Week 2/Notes.md',
      'Week 10',
      'A.md',
      'b.md',
    ]);
    expect(rows[3]).toMatchObject({ depth: 2, position: 1, siblings: 1 });
    expect(rows[0]).toMatchObject({ depth: 1, position: 1, siblings: 6 });
  });
});

describe('ancestorsOf', () => {
  it('lists containing folders outermost first', () => {
    expect(ancestorsOf('A/B/C/note.md')).toEqual(['A', 'A/B', 'A/B/C']);
    expect(ancestorsOf('note.md')).toEqual([]);
  });
});
