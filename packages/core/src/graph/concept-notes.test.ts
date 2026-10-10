import { describe, expect, it } from 'vitest';
import { analyseNote } from '../markdown/index';
import { type ConceptForNote, conceptNotes } from './concept-notes';

const concept = (
  id: string,
  name: string,
  extra: Partial<ConceptForNote> = {},
): ConceptForNote => ({
  id,
  name,
  summary: '',
  aliases: [],
  modules: [],
  ...extra,
});

const edge = (source: string, target: string, relation: string, extra = {}) =>
  ({ source, target, relation, kind: 'relation', status: 'accepted', ...extra }) as never;

describe('concepts as Markdown notes', () => {
  const concepts = [
    concept('c1', 'Raft', {
      summary: 'A consensus algorithm built around a **leader**.',
      aliases: ['Raft consensus'],
      modules: ['COC251'],
    }),
    concept('c2', 'Paxos'),
    concept('c3', 'TCP/IP'),
    concept('c4', 'TCP:IP'),
  ];

  it('writes a note per concept with front matter that the notes parser reads', () => {
    const files = conceptNotes(concepts, []);
    const raft = files.find((file) => file.conceptId === 'c1');
    expect(raft?.path).toBe('Concepts/Raft.md');
    expect(raft?.content).toBe(
      [
        '---',
        'type: concept',
        'aliases: ["Raft consensus"]',
        'modules: ["COC251"]',
        'tags: [concept]',
        '---',
        '',
        '# Raft',
        '',
        'A consensus algorithm built around a **leader**.',
        '',
      ].join('\n'),
    );
    const analysed = analyseNote(raft?.content ?? '');
    expect(analysed.frontmatterError).toBeNull();
    expect(analysed.type).toBe('concept');
    expect(analysed.aliases).toEqual(['Raft consensus']);
  });

  it('writes the relations as links, from both ends, only when accepted', () => {
    const files = conceptNotes(concepts, [
      edge('c2', 'c1', 'prerequisite_for'),
      edge('c1', 'c4', 'relates_to'),
      edge('c1', 'c2', 'example_of', { status: 'proposed' }),
      edge('c1', 'c2', 'links_to', { kind: 'link' }),
    ]);
    const content = (id: string) => files.find((file) => file.conceptId === id)?.content ?? '';
    expect(content('c2')).toContain('## Related\n\n- is a prerequisite for [[Raft]]');
    expect(content('c1')).toContain('- depends on [[Paxos]]');
    expect(content('c1')).not.toContain('example');
    // Symmetric relations read the same both ways.
    expect(content('c1')).toMatch(/- relates to \[\[TCP-IP( 2)?\|TCP:IP\]\]/u);
    expect(content('c4')).toContain('- relates to [[Raft]]');
  });

  it('keeps names that are not file names apart and linkable', () => {
    const files = conceptNotes(concepts, []);
    const paths = files.map((file) => file.path).sort();
    expect(new Set(paths).size).toBe(4);
    expect(paths).toContain('Concepts/TCP-IP.md');
    expect(paths).toContain('Concepts/TCP-IP 2.md');
    for (const file of files) expect(file.path).not.toMatch(/[:*?"<>|\\]|\/.*\//u);
    const slash = files.find((file) => file.conceptId === 'c3');
    expect(slash?.content).toContain('title: "TCP/IP"');
  });
});
