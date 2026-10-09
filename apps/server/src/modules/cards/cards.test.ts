import {
  CardSchema,
  CardSetDetailSchema,
  CardSetSchema,
  ConceptSummarySchema,
  ModuleSummarySchema,
  ReviewSettingsSchema,
} from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { jsonApi } from '../../../test/api-helpers';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';

let bed: SourcesTestbed;
afterEach(() => bed?.cleanup());

async function setUp() {
  bed = createSourcesTestbed();
  await bed.start();
  const api = jsonApi(bed.request);
  const module = await api.post(
    '/api/modules',
    { code: 'COC251', title: 'DS' },
    201,
    ModuleSummarySchema,
  );
  const set = await api.post(
    '/api/card-sets',
    { title: 'Consensus', moduleId: module.id },
    201,
    CardSetSchema,
  );
  return { api, module, set };
}

const ordinals = (card: { faces: { ordinal: number }[] }) => card.faces.map((face) => face.ordinal);

describe('cards', () => {
  it('keeps faces in step with the kind and the cloze numbers', async () => {
    const { api, set } = await setUp();
    expect(set).toMatchObject({ module: { code: 'COC251' }, counts: { cards: 0, new: 0 } });
    const basic = await api.post(
      '/api/cards',
      {
        setId: set.id,
        kind: 'basic',
        front: 'Which algorithm elects a leader per term?',
        back: 'Raft',
      },
      201,
      CardSchema,
    );
    expect(ordinals(basic)).toEqual([0]);
    expect(basic.faces[0]).toMatchObject({ state: 'new', reps: 0 });

    const reversed = await api.patch(
      `/api/cards/${basic.id}`,
      { kind: 'reversed' },
      200,
      CardSchema,
    );
    expect(ordinals(reversed)).toEqual([0, 1]);

    const cloze = await api.post(
      '/api/cards',
      { setId: set.id, kind: 'cloze', front: 'Raft has a {{c1::leader}} per {{c2::term}}.' },
      201,
      CardSchema,
    );
    expect(ordinals(cloze)).toEqual([1, 2]);
    const fewer = await api.patch(
      `/api/cards/${cloze.id}`,
      { front: 'Raft has a {{c1::leader}}.' },
      200,
      CardSchema,
    );
    expect(ordinals(fewer)).toEqual([1]);
    const more = await api.patch(
      `/api/cards/${cloze.id}`,
      { front: 'Raft has a {{c1::leader}} per {{c2::term}} and a {{c3::log}}.' },
      200,
      CardSchema,
    );
    expect(ordinals(more)).toEqual([1, 2, 3]);
    await api.patch(`/api/cards/${cloze.id}`, { front: 'No deletions left' }, 400);
    await api.post('/api/cards', { setId: set.id, kind: 'cloze', front: 'Nothing to recall' }, 400);

    const detail = await api.get(`/api/card-sets/${set.id}`, CardSetDetailSchema);
    expect(detail.counts).toMatchObject({ cards: 2, new: 5, due: 0, suspended: 0 });
    expect(detail.cards.map((card) => card.kind)).toEqual(['reversed', 'cloze']);
  });

  it('links concepts, keeps sources and moves, suspends and deletes in bulk', async () => {
    const { api, set } = await setUp();
    const raft = await api.post('/api/concepts', { name: 'Raft' }, 201, ConceptSummarySchema);
    const card = await api.post(
      '/api/cards',
      {
        setId: set.id,
        kind: 'basic',
        front: 'What does a Raft leader send to keep its term?',
        back: 'Heartbeats',
        extra: 'AppendEntries with no entries.',
        conceptIds: [raft.id],
        locator: { kind: 'pdf', sourceId: 'src_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7', page: 12 },
      },
      201,
      CardSchema,
    );
    expect(card.concepts).toEqual([{ id: raft.id, name: 'Raft' }]);
    expect(card.locator).toMatchObject({ kind: 'pdf', page: 12 });
    await api.post(
      '/api/cards',
      {
        setId: set.id,
        kind: 'basic',
        front: 'Q',
        back: 'A',
        conceptIds: ['con_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7'],
      },
      400,
    );

    const other = await api.post('/api/card-sets', { title: 'Elsewhere' }, 201, CardSetSchema);
    const second = await api.post(
      '/api/cards',
      { setId: set.id, kind: 'basic', front: 'Q2', back: 'A2' },
      201,
      CardSchema,
    );
    const bulk = z.object({ changed: z.number() });
    expect(
      (
        await api.post(
          '/api/cards/bulk',
          { ids: [card.id, second.id], action: 'suspend' },
          200,
          bulk,
        )
      ).changed,
    ).toBe(2);
    expect((await api.get(`/api/card-sets/${set.id}`, CardSetDetailSchema)).counts).toMatchObject({
      suspended: 2,
      new: 0,
    });
    await api.post('/api/cards/bulk', { ids: [second.id], action: 'move' }, 400);
    await api.post('/api/cards/bulk', { ids: [second.id], action: 'move', setId: other.id }, 200);
    await api.post('/api/cards/bulk', { ids: [card.id], action: 'activate' }, 200);
    expect(
      (await api.get(`/api/card-sets/${other.id}`, CardSetDetailSchema)).cards.map((c) => c.id),
    ).toEqual([second.id]);
    await api.delete(`/api/cards/${card.id}`);
    await api.get(`/api/cards/${card.id}`, undefined, 404);
    await api.delete(`/api/card-sets/${other.id}`);
    const sets = await api.get('/api/card-sets', z.object({ sets: z.array(CardSetSchema) }));
    expect(sets.sets.map((s) => s.title)).toEqual(['Consensus']);
  });

  it('exports a set for Anki and imports it again', async () => {
    const { api, set } = await setUp();
    await api.post(
      '/api/cards',
      { setId: set.id, kind: 'basic', front: 'Raft?', back: 'Leader-based', extra: 'Lecture 3' },
      201,
    );
    await api.post(
      '/api/cards',
      { setId: set.id, kind: 'cloze', front: 'A {{c1::quorum}} is a majority' },
      201,
    );
    const exported = await api.get(
      `/api/card-sets/${set.id}/export`,
      z.object({ filename: z.string(), content: z.string() }),
    );
    expect(exported.filename).toBe('Consensus.txt');
    expect(exported.content).toContain('Cloze\tA {{c1::quorum}} is a majority');

    const copy = await api.post('/api/card-sets', { title: 'Copy' }, 201, CardSetSchema);
    const result = await api.post(
      `/api/card-sets/${copy.id}/import`,
      { content: `${exported.content}Cloze\tno deletions here\t\n` },
      200,
      z.object({ imported: z.number(), skipped: z.number() }),
    );
    expect(result).toEqual({ imported: 2, skipped: 1 });
    const imported = await api.get(`/api/card-sets/${copy.id}`, CardSetDetailSchema);
    expect(
      imported.cards.map((card) => [card.kind, card.front, card.back, card.createdBy]),
    ).toEqual([
      ['basic', 'Raft?', 'Leader-based\n\nLecture 3', 'import'],
      ['cloze', 'A {{c1::quorum}} is a majority', '', 'import'],
    ]);
  });

  it('validates review settings', async () => {
    const { api } = await setUp();
    const defaults = await api.get('/api/settings/review', ReviewSettingsSchema);
    expect(defaults).toMatchObject({
      desiredRetention: 0.9,
      newPerDay: 20,
      learningSteps: ['1m', '10m'],
    });
    await api.patch('/api/settings/review', { desiredRetention: 0.99 }, 400);
    await api.patch('/api/settings/review', { learningSteps: ['soon'] }, 400);
    const changed = await api.patch(
      '/api/settings/review',
      { desiredRetention: 0.85, newPerDay: 5 },
      200,
      ReviewSettingsSchema,
    );
    expect(changed).toMatchObject({
      desiredRetention: 0.85,
      newPerDay: 5,
      maximumIntervalDays: 365,
    });
  });
});
