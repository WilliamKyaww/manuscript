import { describe, expect, it } from 'vitest';
import { findDuplicate, jaroWinkler, normaliseConceptName } from './dedup';

const existing = [
  { id: 'cap', names: ['CAP theorem', "Brewer's theorem"] },
  { id: 'l3', names: ['Lecture 3'] },
  { id: 'paxos', names: ['Paxos'] },
  { id: 'replication', names: ['State machine replication'] },
];

describe('concept de-duplication', () => {
  it('normalises names', () => {
    expect(normaliseConceptName("  The CAP-Theorem's  ")).toBe('cap theorem');
    expect(jaroWinkler('martha', 'marhta')).toBeCloseTo(0.961, 3);
    expect(jaroWinkler('', 'x')).toBe(0);
  });

  it('finds the same concept written differently, or under an alias', () => {
    expect(findDuplicate(['cap theorem'], existing)).toMatchObject({ kind: 'exact', id: 'cap' });
    expect(findDuplicate(['Brewers theorem'], existing)).toMatchObject({
      kind: 'exact',
      id: 'cap',
    });
    expect(findDuplicate(['State-machine replications'], existing)).toMatchObject({
      kind: 'exact',
      id: 'replication',
    });
    expect(findDuplicate(['State machine replicaton'], existing)).toMatchObject({
      kind: 'similar',
      id: 'replication',
    });
  });

  it('never merges across the guards', () => {
    // Different numbers, a short label, and a name that only adds a word.
    expect(findDuplicate(['Lecture 4'], existing)).toBeNull();
    expect(findDuplicate(['Paxo'], existing)).toBeNull();
    expect(findDuplicate(['Multi Paxos'], existing)).toBeNull();
    expect(findDuplicate(['Gossip protocol'], existing)).toBeNull();
  });
});
