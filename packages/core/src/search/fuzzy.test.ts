import { describe, expect, it } from 'vitest';
import { rankCandidates, type SwitcherCandidate } from './fuzzy';

const note = (id: string, title: string, names: string[] = [], path = ''): SwitcherCandidate => ({
  id,
  title,
  names,
  path,
});

const candidates = [
  note('a', 'Raft', [], 'Modules/COC251/Raft.md'),
  note('b', 'Raft consensus algorithm', ['Raft paper'], 'Reading/Raft consensus algorithm.md'),
  note('c', 'Aircraft maintenance', [], 'Other/Aircraft maintenance.md'),
  note('d', 'Paxos made simple', ['Synod'], 'Modules/COC251/Paxos.md'),
  note('e', 'Café scheduling', [], 'Ideas/Café scheduling.md'),
  note('f', 'Leader election', [], 'Modules/COC251/Leader election.md'),
];

const ids = (query: string, recent?: string[]) =>
  rankCandidates(query, candidates, recent ? { recent } : {}).map((match) => match.candidate.id);

describe('rankCandidates', () => {
  it('orders exact, prefix, word-prefix, substring and fuzzy matches', () => {
    expect(ids('raft')).toEqual(['a', 'b', 'c']);
    expect(ids('elec')).toEqual(['f']);
    expect(ids('pms')).toEqual(['d']);
  });

  it('matches aliases and reports which label matched', () => {
    const [match] = rankCandidates('synod', candidates);
    expect(match).toMatchObject({ label: 'Synod', ranges: [[0, 5]] });
    expect(match?.candidate.id).toBe('d');
  });

  it('ignores case and accents and maps highlights back to the original text', () => {
    const [match] = rankCandidates('cafe sch', candidates);
    expect(match?.candidate.id).toBe('e');
    expect(match?.ranges).toEqual([[0, 8]]);
  });

  it('matches folder paths only when the query contains a slash', () => {
    expect(ids('coc251/pax')).toEqual(['d']);
    expect(ids('coc251')).toEqual([]);
  });

  it('boosts recent items and lists them for an empty query', () => {
    // Recency reorders matches of similar quality, but an exact title still comes first.
    expect(ids('ra', ['b'])[0]).toBe('b');
    expect(ids('raft', ['b'])[0]).toBe('a');
    expect(ids('', ['f', 'a'])).toEqual(['f', 'a']);
    expect(ids('')).toEqual([]);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(ids('zzz')).toEqual([]);
  });

  it('ranks 10,000 candidates quickly', () => {
    const many = Array.from({ length: 10_000 }, (_, index) =>
      note(`n${index}`, `Note ${index} about topic ${index % 97}`),
    );
    const started = performance.now();
    rankCandidates('topic 42', many, { limit: 20 });
    expect(performance.now() - started).toBeLessThan(250);
  });
});
