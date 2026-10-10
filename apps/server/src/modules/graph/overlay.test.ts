import { CrossModuleConnectionsSchema, GraphPayloadSchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { practiceTestbed } from '../../../test/practice-helpers';

let bed: Awaited<ReturnType<typeof practiceTestbed>>['bed'] | undefined;
afterEach(() => bed?.cleanup());

describe('the mastery overlay and connections across modules', () => {
  it('tells each concept node how well it is known, and whether to study it now', async () => {
    const testbed = await practiceTestbed();
    bed = testbed.bed;
    const { api, raft, paxos, mcq, quiz, attempt, answer } = testbed;
    // The quiz is made from the questions that exist when it is built.
    const right = await Promise.all(
      [0, 1, 2, 3, 4].map((n) => mcq([raft.id], { stem: `Raft ${n}` })),
    );
    const wrong = await Promise.all(
      [0, 1, 2, 3].map((n) => mcq([paxos.id], { stem: `Paxos ${n}` })),
    );
    const started = await attempt((await quiz({ kind: 'practice', config: {} })).id);
    for (const question of right)
      await answer(started.id, { questionId: question.id, response: { kind: 'mcq', choice: 'a' } });
    for (const question of wrong)
      await answer(started.id, { questionId: question.id, response: { kind: 'mcq', choice: 'b' } });

    const payload = await api.get('/api/graph?types=concept', GraphPayloadSchema);
    const byLabel = new Map(payload.nodes.map((node) => [node.label, node]));
    expect(byLabel.get('Raft')?.mastery).toMatchObject({ weak: false, value: 1 });
    expect(byLabel.get('Paxos')?.mastery).toMatchObject({ weak: true, value: 0 });
    expect(byLabel.get('Paxos')?.mastery?.stage).toBe('learning');
    // Notes and the rest carry no figure.
    const all = await api.get('/api/graph', GraphPayloadSchema);
    expect(all.nodes.filter((node) => node.type !== 'concept').every((node) => !node.mastery)).toBe(
      true,
    );
  });

  it('lists concepts shared by modules and relations that cross them', async () => {
    const testbed = await practiceTestbed();
    bed = testbed.bed;
    const { api, module, concept } = testbed;
    const other = await api.post<{ id: string }>('/api/modules', {
      code: 'COC300',
      title: 'Databases',
      credits: 15,
    });
    const logging = await concept('Logging', { moduleIds: [module.id, other.id] });
    const transactions = await api.post<{ id: string }>('/api/concepts', {
      name: 'Transactions',
      moduleIds: [other.id],
    });
    const consensus = await concept('Consensus');
    await api.post(
      '/api/relations',
      { from: consensus.id, to: transactions.id, relation: 'prerequisite_for' },
      201,
    );
    // Inside one module: not a crossing.
    await api.post(
      '/api/relations',
      { from: consensus.id, to: logging.id, relation: 'relates_to' },
      201,
    );

    const connections = await api.get('/api/graph/connections', CrossModuleConnectionsSchema);
    expect(connections.shared.map((entry) => [entry.node.label, entry.modules])).toEqual([
      ['Logging', ['COC251', 'COC300']],
    ]);
    expect(connections.links.map((link) => link.why)).toEqual([
      'Consensus (COC251) is a prerequisite for Transactions (COC300).',
    ]);
  });
});
