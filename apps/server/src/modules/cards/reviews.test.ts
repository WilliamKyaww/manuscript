import {
  CardSchema,
  CardSetSchema,
  ConceptSummarySchema,
  ReviewItemSchema,
  ReviewQueueSchema,
  ReviewStatsSchema,
  SessionSummarySchema,
} from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { jsonApi } from '../../../test/api-helpers';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';
import type { FixedClock } from '../../shared/clock';
import { reviewDay } from './days';

let bed: SourcesTestbed;
afterEach(() => bed?.cleanup());

const MINUTE = 60_000;
const DAY = 86_400_000;

async function setUp() {
  bed = createSourcesTestbed();
  await bed.start();
  const api = jsonApi(bed.request);
  const clock = bed.ctx.clock as FixedClock;
  const set = await api.post('/api/card-sets', { title: 'Consensus' }, 201, CardSetSchema);
  const card = (front: string, extra: Record<string, unknown> = {}) =>
    api.post(
      '/api/cards',
      { setId: set.id, kind: 'basic', front, back: `${front}!`, ...extra },
      201,
      CardSchema,
    );
  const queue = (query = '') => api.get(`/api/review/queue${query}`, ReviewQueueSchema);
  const rate = (cardId: string, ordinal: number, rating: number, sessionId?: string) =>
    api.post('/api/reviews', { cardId, ordinal, rating, durationMs: 4_000, sessionId }, 201);
  return { api, clock, set, card, queue, rate };
}

describe('the review queue', () => {
  it('shows new faces, then learning faces when due, and undo restores a face exactly', async () => {
    const { api, clock, card, queue, rate } = await setUp();
    const first = await card('Who proposed Paxos?');
    const second = await card('What does Raft elect?', { kind: 'reversed' });
    const initial = await queue();
    expect(initial.counts).toEqual({ new: 3, learning: 0, review: 0 });
    expect(initial.items.map((item) => [item.cardId, item.ordinal])).toEqual([
      [first.id, 0],
      [second.id, 0],
      [second.id, 1],
    ]);
    const reversed = initial.items[2];
    expect(reversed).toMatchObject({
      front: 'What does Raft elect?!',
      back: 'What does Raft elect?',
      state: 'new',
    });
    expect(initial.items[0]?.intervals.map((interval) => interval.label)).toEqual([
      '1 min',
      '6 min',
      '10 min',
      expect.stringMatching(/d$/),
    ]);

    // Good on a new face: back in ten minutes, in learning.
    await rate(first.id, 0, 3);
    const later = await queue();
    expect(later.counts).toEqual({ new: 2, learning: 0, review: 0 });
    clock.advance(11 * MINUTE);
    const due = await queue();
    expect(due.items[0]).toMatchObject({ cardId: first.id, state: 'learning' });
    expect(due.counts.learning).toBe(1);

    // Undo puts it back as it was, and the log keeps both rows.
    const before = (await api.get(`/api/cards/${first.id}`, CardSchema)).faces[0];
    await rate(first.id, 0, 1);
    const undone = await api.post(
      '/api/reviews/undo',
      {},
      200,
      z.object({ item: ReviewItemSchema }),
    );
    expect(undone.item).toMatchObject({ cardId: first.id, ordinal: 0, state: 'learning' });
    expect((await api.get(`/api/cards/${first.id}`, CardSchema)).faces[0]).toEqual(before);
    const kinds = bed.ctx.db.all<{ kind: string }>(
      'SELECT kind FROM review_logs ORDER BY reviewed_at, id',
    );
    expect(kinds.map((row) => row.kind)).toEqual(['review', 'review', 'undo']);
    expect(() => bed.ctx.db.run(`UPDATE review_logs SET rating = 4`)).toThrow('append-only');
    expect(() => bed.ctx.db.run('DELETE FROM review_logs')).toThrow('append-only');
    // The undone rating is gone for good: undoing again takes back the one before it.
    const again = await api.post(
      '/api/reviews/undo',
      {},
      200,
      z.object({ item: ReviewItemSchema }),
    );
    expect(again.item.state).toBe('new');
    await api.post('/api/reviews/undo', {}, 404);
  });

  it('limits new faces per day and puts the least remembered reviews first', async () => {
    const { api, clock, card, queue, rate } = await setUp();
    await api.patch('/api/settings/review', { newPerDay: 2, fuzz: false }, 200);
    const cards = [];
    for (const front of ['One', 'Two', 'Three', 'Four']) cards.push(await card(`Card ${front}`));
    expect((await queue()).items.map((item) => item.cardId)).toEqual([cards[0]?.id, cards[1]?.id]);
    // Easy graduates straight to review; the second is reviewed a day later, so it is due later.
    await rate(cards[0]?.id as string, 0, 4);
    await rate(cards[1]?.id as string, 0, 4);
    expect((await queue()).counts).toEqual({ new: 0, learning: 0, review: 0 });
    clock.advance(DAY);
    const tomorrow = await queue();
    expect(tomorrow.counts.new).toBe(2);
    clock.advance(30 * DAY);
    const overdue = await queue();
    const reviews = overdue.items.filter((item) => item.state === 'review');
    expect(reviews).toHaveLength(2);
    const recall = reviews.map((item) => item.retrievability as number);
    expect(recall[0]).toBeLessThanOrEqual(recall[1] as number);
    // Reviews come before new faces.
    expect(overdue.items.map((item) => item.state)).toEqual(['review', 'review', 'new', 'new']);
  });

  it('buries a face until tomorrow and narrows to a set', async () => {
    const { api, clock, card, queue, set } = await setUp();
    const buried = await card('Buried');
    const kept = await card('Kept');
    await api.post(`/api/cards/${buried.id}/bury`, { ordinal: 0 }, 200);
    expect((await queue()).items.map((item) => item.cardId)).toEqual([kept.id]);
    const other = await api.post('/api/card-sets', { title: 'Other' }, 201, CardSetSchema);
    await api.post(
      '/api/cards',
      { setId: other.id, kind: 'basic', front: 'Elsewhere', back: 'x' },
      201,
    );
    expect((await queue(`?set=${set.id}`)).items.map((item) => item.cardId)).toEqual([kept.id]);
    clock.advance(reviewDay(clock.now()).end.getTime() - clock.now().getTime() + MINUTE);
    expect((await queue(`?set=${set.id}`)).items.map((item) => item.cardId)).toEqual([
      buried.id,
      kept.id,
    ]);
  });
});

describe('sessions and statistics', () => {
  it('summarises a session and counts reviews by day', async () => {
    const { api, clock, card, rate, set } = await setUp();
    const paxos = await api.post('/api/concepts', { name: 'Paxos' }, 201, ConceptSummarySchema);
    const a = await card('A?', { conceptIds: [paxos.id] });
    const b = await card('B?');
    const session = await api.post(
      '/api/review-sessions',
      { setId: set.id },
      201,
      SessionSummarySchema,
    );
    await rate(a.id, 0, 4, session.id);
    await rate(b.id, 0, 1, session.id);
    clock.advance(2 * MINUTE);
    await rate(b.id, 0, 3, session.id);
    const summary = await api.post(
      `/api/review-sessions/${session.id}/end`,
      {},
      200,
      SessionSummarySchema,
    );
    expect(summary).toMatchObject({
      reviews: 3,
      newFaces: 2,
      again: 1,
      trueRetention: null,
      lapses: 0,
      durationMs: 12_000,
      concepts: [{ name: 'Paxos' }],
    });
    expect(summary.endedAt).not.toBeNull();

    const stats = await api.get('/api/review/stats', ReviewStatsSchema);
    expect(stats.history).toHaveLength(30);
    expect(stats.history.at(-1)).toMatchObject({
      date: reviewDay(clock.now()).key,
      reviews: 3,
      again: 1,
    });
    expect(stats.forecast).toHaveLength(30);
    expect(stats.forecast.reduce((sum, day) => sum + day.count, 0)).toBe(2);
    expect(stats).toMatchObject({ cards: 2, faces: 2, trueRetention: null });
    await api.post('/api/reviews', { cardId: a.id, ordinal: 3, rating: 3, durationMs: 1 }, 404);
    await api.post('/api/reviews', { cardId: a.id, ordinal: 0, rating: 5, durationMs: 1 }, 400);
  });
});
