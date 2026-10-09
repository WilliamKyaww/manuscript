import { describe, expect, it } from 'vitest';
import { hashUnit, initialPosition, iterationsFor, placeCommunities } from './layout';

describe('graph starting positions', () => {
  it('hashes ids to the same point every time', () => {
    expect(hashUnit('con_1')).toBe(hashUnit('con_1'));
    expect(hashUnit('con_1')).not.toBe(hashUnit('con_2'));
    expect(hashUnit('anything')).toBeGreaterThanOrEqual(0);
    expect(hashUnit('anything')).toBeLessThan(1);
  });

  it('gives communities their own places, members near them and the rest outside', () => {
    const placement = placeCommunities([
      { id: 4, size: 40 },
      { id: 1, size: 10 },
      { id: 7, size: 10 },
    ]);
    const [big, small, other] = [4, 1, 7].map((id) => placement.centres.get(id));
    if (!big || !small || !other) throw new Error('missing centre');
    // The largest sits in the middle, with the most room.
    expect(Math.hypot(big.x, big.y)).toBe(0);
    expect(big.spread).toBeGreaterThan(small.spread);
    // Centres do not overlap.
    expect(Math.hypot(small.x - other.x, small.y - other.y)).toBeGreaterThan(
      small.spread + other.spread,
    );
    const member = initialPosition('note_1', 1, placement);
    expect(Math.hypot(member.x - small.x, member.y - small.y)).toBeLessThanOrEqual(small.spread);
    expect(initialPosition('note_1', 1, placement)).toEqual(member);
    const loner = initialPosition('note_2', null, placement);
    expect(Math.hypot(loner.x, loner.y)).toBeGreaterThanOrEqual(placement.outer);
  });

  it('runs fewer iterations on larger graphs', () => {
    expect(iterationsFor(100)).toBeGreaterThan(iterationsFor(1_000));
    expect(iterationsFor(1_000)).toBeGreaterThan(iterationsFor(5_000));
  });
});
