import { addDays, ResurfaceItemSchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { practiceTestbed } from '../../../test/practice-helpers';

let bed: Awaited<ReturnType<typeof practiceTestbed>>['bed'] | undefined;
afterEach(() => bed?.cleanup());

const Resurface = z.object({ items: z.array(ResurfaceItemSchema) });
const HOUR = 3_600_000;

describe('resurfacing before a lecture or an exam', () => {
  it('brings up the weakest concepts of the module and the notes to reread, only when something is near', async () => {
    const testbed = await practiceTestbed();
    bed = testbed.bed;
    testbed.clock.advance(10 * HOUR);
    const { api, module, raft, paxos, mcq, quiz, attempt, answer } = testbed;
    const today = (await api.get('/api/plan', z.object({ today: z.string() }))).today;

    // Nothing to bring up until something is near.
    expect((await api.get('/api/resurface', Resurface)).items).toEqual([]);

    const note = await api.post<{ id: string }>('/api/notes', {
      title: 'Raft',
      content: '# Raft\n',
    });
    await api.patch(`/api/concepts/${raft.id}`, { noteId: note.id }, 200);
    const wrong = await Promise.all([0, 1, 2, 3].map((n) => mcq([raft.id], { stem: `Raft ${n}` })));
    const right = await Promise.all(
      [0, 1, 2, 3].map((n) => mcq([paxos.id], { stem: `Paxos ${n}` })),
    );
    const started = await attempt((await quiz({ kind: 'practice', config: {} })).id);
    for (const question of wrong)
      await answer(started.id, { questionId: question.id, response: { kind: 'mcq', choice: 'b' } });
    for (const question of right)
      await answer(started.id, { questionId: question.id, response: { kind: 'mcq', choice: 'a' } });

    await api.post(`/api/modules/${module.id}/lectures`, {
      key: 'L4',
      title: 'Consensus',
      heldOn: addDays(today, 1),
    });
    await api.post(`/api/modules/${module.id}/lectures`, {
      key: 'L9',
      title: 'Far away',
      heldOn: addDays(today, 20),
    });
    await api.post(`/api/modules/${module.id}/assessments`, {
      title: 'Exam',
      kind: 'exam',
      weight: 0.7,
      dueAt: addDays(today, 5),
    });

    const { items } = await api.get('/api/resurface', Resurface);
    expect(items.map((item) => [item.kind, item.title, item.daysUntil])).toEqual([
      ['lecture', 'COC251 L4 — Consensus', 1],
      ['exam', 'COC251 Exam', 5],
    ]);
    for (const item of items) {
      // Raft is wrong every time; Paxos is known well and is left out.
      expect(item.concepts.map((entry) => entry.concept.name)).toEqual(['Raft']);
      expect(item.concepts[0]?.reason).toBe('Mastery 0.00 with medium confidence.');
      expect(item.notes.map((entry) => entry.title)).toEqual(['Raft']);
    }
    // A shorter look-ahead leaves the exam out.
    expect(
      (await api.get('/api/resurface?days=2', Resurface)).items.map((item) => item.kind),
    ).toEqual(['lecture']);
  });
});
