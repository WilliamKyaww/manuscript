import { describe, expect, it } from 'vitest';
import { mockEmbedding } from '../mock';
import { contentHash } from './repository';
import { buildVectorIndex } from './vector-index';

const vector = (...values: number[]) => Float32Array.from(values);

describe('the vector index', () => {
  it('ranks by cosine, filters by kind and keeps the best k', () => {
    const index = buildVectorIndex([
      { type: 'chunk', id: '1', vector: vector(1, 0, 0) },
      { type: 'chunk', id: '2', vector: vector(0.9, 0.1, 0) },
      { type: 'note', id: 'n', vector: vector(0.95, 0.05, 0) },
      { type: 'chunk', id: '3', vector: vector(0, 1, 0) },
      // Another model's length: left out rather than compared wrongly.
      { type: 'chunk', id: 'odd', vector: vector(1, 0) },
    ]);
    expect(index.size).toBe(4);
    const hits = index.search([1, 0, 0], { limit: 2 });
    expect(hits.map((hit) => hit.id)).toEqual(['1', 'n']);
    expect(hits[0]?.score).toBeCloseTo(1, 2);
    expect(index.search([1, 0, 0], { limit: 5, type: 'chunk' }).map((hit) => hit.id)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(index.search([1, 0], { limit: 2 })).toEqual([]);
    expect(index.vectorOf('note', 'n')?.[0]).toBeCloseTo(0.998, 1);
    expect(index.vectorOf('note', 'missing')).toBeNull();
  });

  it('finds related text with the test model', () => {
    const index = buildVectorIndex(
      ['raft elects a leader', 'paxos uses ballots', 'leader election in raft'].map(
        (text, position) => ({
          type: 'chunk' as const,
          id: String(position),
          vector: Float32Array.from(mockEmbedding(text)),
        }),
      ),
    );
    expect(index.search(mockEmbedding('how does raft elect a leader'), { limit: 1 })[0]?.id).toBe(
      '0',
    );
    expect(contentHash('a')).not.toBe(contentHash('b'));
    expect(contentHash('same')).toBe(contentHash('same'));
  });
});
