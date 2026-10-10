import { afterEach, describe, expect, it } from 'vitest';
import { practiceTestbed } from '../../../test/practice-helpers';

let bed: Awaited<ReturnType<typeof practiceTestbed>>['bed'] | undefined;
afterEach(() => bed?.cleanup());

type Pending = {
  proposals: {
    id: string;
    kind: string;
    payload: { kind: string; heading: string; text: string; noteTitle: string };
  }[];
};

describe('what a session got wrong', () => {
  async function setUp() {
    const testbed = await practiceTestbed();
    bed = testbed.bed;
    const { api, raft, mcq, quiz, attempt, answer } = testbed;
    const note = await api.post<{ id: string }>('/api/notes', {
      title: 'Raft',
      content: '# Raft\n\nRaft elects a leader.\n\n## Related\n\n- Paxos\n',
    });
    await api.patch(`/api/concepts/${raft.id}`, { noteId: note.id }, 200);
    const question = await mcq([raft.id], {
      explanation: 'The election is for leadership; a quorum only votes.',
    });
    const run = async (choice: string) => {
      const q = await quiz({ kind: 'practice', config: {} });
      const started = await attempt(q.id);
      await answer(started.id, { questionId: question.id, response: { kind: 'mcq', choice } });
      await api.post(`/api/attempts/${started.id}/finish`, {}, 200);
    };
    return { ...testbed, note, question, run };
  }

  it('suggests the mistake for the concept’s note when the attempt finishes, and changes nothing until accepted', async () => {
    const { api, note, run } = await setUp();
    await run('b');
    const { proposals } = await api.get<Pending>('/api/proposals?kind=addition');
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.payload).toMatchObject({
      kind: 'addition',
      heading: 'Common mistakes',
      noteTitle: 'Raft',
    });
    expect(proposals[0]?.payload.text).toBe(
      '- What does Raft elect? **A leader** — The election is for leadership; a quorum only votes.',
    );
    expect((await api.get<{ content: string }>(`/api/notes/${note.id}`)).content).not.toContain(
      'Common mistakes',
    );

    await api.post(`/api/proposals/${proposals[0]?.id}/accept`, {}, 200);
    const accepted = await api.get<{ content: string }>(`/api/notes/${note.id}`);
    expect(accepted.content).toContain('## Common mistakes');
    expect(accepted.content).toContain('- What does Raft elect? **A leader**');
    // The note's own sections are untouched.
    expect(accepted.content).toContain('## Related\n\n- Paxos');
  });

  it('does not suggest the same mistake twice, nor one the note already holds', async () => {
    const { api, run } = await setUp();
    await run('b');
    await run('b');
    expect((await api.get<Pending>('/api/proposals?kind=addition')).proposals).toHaveLength(1);
    const [first] = (await api.get<Pending>('/api/proposals?kind=addition')).proposals;
    await api.post(`/api/proposals/${first?.id}/accept`, {}, 200);
    await run('b');
    expect((await api.get<Pending>('/api/proposals?kind=addition')).proposals).toHaveLength(0);
  });

  it('says nothing about right answers or concepts without a note of their own', async () => {
    const { api, paxos, mcq, quiz, attempt, answer, run } = await setUp();
    await run('a');
    expect((await api.get<Pending>('/api/proposals?kind=addition')).proposals).toHaveLength(0);
    const unnoted = await mcq([paxos.id], { stem: 'Paxos question' });
    const started = await attempt((await quiz({ kind: 'practice', config: {} })).id);
    await answer(started.id, { questionId: unnoted.id, response: { kind: 'mcq', choice: 'b' } });
    await api.post(`/api/attempts/${started.id}/finish`, {}, 200);
    expect((await api.get<Pending>('/api/proposals?kind=addition')).proposals).toHaveLength(0);
  });
});
