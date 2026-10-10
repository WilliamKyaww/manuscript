import {
  CHECK_MARKER,
  type ChatEvent,
  ChatEventSchema,
  type ChatThread,
  ChatThreadSchema,
  ConceptMasteryDetailSchema,
  ModuleSummarySchema,
  QuestionSchema,
  type ToolPart,
  tutorReplyProblems,
} from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { jsonApi } from '../../../test/api-helpers';
import { makePptx } from '../../../test/fixtures/sources/builders';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';

let bed: SourcesTestbed | undefined;
afterEach(() => {
  bed?.cleanup();
  bed = undefined;
});

const SLIDES = [
  {
    title: 'Raft elections',
    body: ['A leader needs votes from a majority of the servers in the cluster.'],
  },
  { title: 'Terms', body: ['Time in Raft is divided into terms, each with at most one leader.'] },
];

async function setUp() {
  bed = createSourcesTestbed({ config: { aiMock: true } });
  await bed.start();
  const api = jsonApi(bed.request);
  return { api, bed };
}

async function stream(path: string, body: unknown): Promise<ChatEvent[]> {
  const response = await bed?.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  expect(response?.status).toBe(200);
  return ((await response?.text()) ?? '')
    .trim()
    .split('\n')
    .map((line) => ChatEventSchema.parse(JSON.parse(line)));
}

const send = (thread: ChatThread, text: string) =>
  stream(`/api/chat/threads/${thread.id}/messages`, { text });
const decide = (thread: ChatThread, approvalId: string, decision: 'once' | 'chat' | 'decline') =>
  stream(`/api/chat/threads/${thread.id}/approvals`, { decisions: [{ approvalId, decision }] });

const textOf = (events: ChatEvent[]) =>
  events.flatMap((event) => (event.type === 'text' ? [event.delta] : [])).join('');
const toolsOf = (events: ChatEvent[]): ToolPart[] =>
  events.flatMap((event) => (event.type === 'tool' ? [event.part] : []));

const tutorThread = (api: ReturnType<typeof jsonApi>) =>
  api.post('/api/chat/threads', { mode: 'tutor', scope: 'knowledge' }, 201, ChatThreadSchema);

describe('the hint ladder, in transcripts', () => {
  it('never opens with a full solution, climbs only while the student is stuck, and ends a worked solution with a check question', async () => {
    const { api } = await setUp();
    const thread = await tutorThread(api);
    const transcript: {
      say: string;
      step: Parameters<typeof tutorReplyProblems>[0];
      reply: string;
    }[] = [];
    const turn = async (say: string, step: Parameters<typeof tutorReplyProblems>[0]) => {
      const reply = textOf(await send(thread, say));
      transcript.push({ say, step, reply });
      return reply;
    };

    const first = await turn('How does Raft elect a leader?', 'diagnose');
    expect(first).toMatch(/^Before I explain anything: what do you already know about/u);
    expect(first).not.toMatch(/worked solution|Check question/u);
    await turn('Not sure', 'hint');
    await turn('Still stuck', 'stronger_hint');
    const partial = await turn('I do not get it', 'partial');
    expect(partial).toContain('full worked solution');
    const worked = await turn('Please show me the full solution', 'worked');
    expect(worked).toContain(CHECK_MARKER);
    const evaluated = await turn('Because a majority overlaps', 'evaluate');
    expect(evaluated).not.toContain('worked solution');
    // After a check question the ladder starts again at the bottom.
    const again = await turn('Next, why do terms exist?', 'diagnose');
    expect(again).toMatch(/^Before I explain anything/u);

    // Every reply fits the step it was given.
    for (const { step, reply, say } of transcript)
      expect(tutorReplyProblems(step, reply), say).toEqual([]);
    // Only the one the student asked for gives the solution away.
    const solutions = transcript.filter((entry) => /worked solution for/u.test(entry.reply));
    expect(solutions.map((entry) => entry.say)).toEqual(['Please show me the full solution']);
  });
});

describe('quiz me', () => {
  async function withQuestion() {
    const { api, bed: testbed } = await setUp();
    const module = await api.post(
      '/api/modules',
      { code: 'COC251', title: 'DS' },
      201,
      ModuleSummarySchema,
    );
    const concept = await api.post<{ id: string }>(
      '/api/concepts',
      { name: 'Raft', moduleIds: [module.id] },
      201,
    );
    const question = await api.post(
      '/api/questions',
      {
        stem: 'What does Raft elect?',
        answer: {
          kind: 'mcq',
          options: [
            { id: 'a', text: 'A leader', correct: true },
            { id: 'b', text: 'A quorum', correct: false },
          ],
        },
        conceptIds: [concept.id],
      },
      201,
      QuestionSchema,
    );
    return { api, bed: testbed, concept, question };
  }

  it('puts a question without its answer, records the reply as assisted evidence once approved, and cannot undo it', async () => {
    const { api, concept } = await withQuestion();
    const thread = await tutorThread(api);

    const asked = await send(thread, 'Quiz me on Raft');
    const fetched = toolsOf(asked).findLast((part) => part.tool === 'get_questions');
    expect(fetched).toMatchObject({ state: 'ok', risk: 'read' });
    // The model is given the question and its options, never the key.
    expect(JSON.stringify(fetched?.output)).not.toMatch(/correct|explanation/u);
    expect(textOf(asked)).toContain('Question: What does Raft elect?');

    // The student's reply is recorded only if they approve it.
    const replied = await send(thread, 'A');
    const waiting = toolsOf(replied).findLast((part) => part.state === 'awaiting_approval');
    expect(waiting).toMatchObject({ tool: 'record_answer', risk: 'write', canAllowForChat: true });
    expect(waiting?.reason).toContain('permanently');
    const before = await api.get(`/api/mastery/concepts/${concept.id}`, ConceptMasteryDetailSchema);
    expect(before.answers).toEqual([]);

    const recorded = await decide(thread, waiting?.approvalId ?? '', 'once');
    expect(toolsOf(recorded).findLast((part) => part.tool === 'record_answer')).toMatchObject({
      state: 'ok',
    });
    expect(textOf(recorded)).toMatch(/^Correct\. The answer is: A leader/u);
    const after = await api.get(`/api/mastery/concepts/${concept.id}`, ConceptMasteryDetailSchema);
    expect(after.answers).toHaveLength(1);
    expect(after.answers[0]).toMatchObject({ score: 1, assisted: true });
    // Assisted answers count for less than unassisted ones.
    expect(after.answers[0]?.weight).toBeLessThan(1);

    // It is in the log as something that cannot be taken back.
    const log = await api.get<{ actions: { id: string; tool: string; undoable: boolean }[] }>(
      '/api/agent/actions',
    );
    const entry = log.actions.find((action) => action.tool === 'record_answer');
    expect(entry?.undoable).toBe(false);
    await api.post(`/api/agent/actions/${entry?.id}/undo`, {}, 409);

    // The tutor's quiz does not clutter the quiz list, and a question is not asked twice.
    const quizzes = await api.get<{ quizzes: unknown[] }>('/api/quizzes');
    expect(quizzes.quizzes).toEqual([]);
    const next = await send(thread, 'next');
    expect(textOf(next)).toMatch(/could not find any questions/u);
  });

  it('records nothing when the student declines', async () => {
    const { api, concept } = await withQuestion();
    const thread = await tutorThread(api);
    await send(thread, 'Quiz me on Raft');
    const replied = await send(thread, 'B');
    const waiting = toolsOf(replied).findLast((part) => part.state === 'awaiting_approval');
    const declined = await decide(thread, waiting?.approvalId ?? '', 'decline');
    expect(toolsOf(declined).findLast((part) => part.tool === 'record_answer')).toMatchObject({
      state: 'declined',
    });
    expect(textOf(declined)).toContain('have not recorded that answer');
    const after = await api.get(`/api/mastery/concepts/${concept.id}`, ConceptMasteryDetailSchema);
    expect(after.answers).toEqual([]);
  });

  it('lets the student approve answers for the rest of the conversation', async () => {
    const { api, concept } = await withQuestion();
    await api.post(
      '/api/questions',
      {
        stem: 'What does a term have at most?',
        answer: {
          kind: 'mcq',
          options: [
            { id: 'a', text: 'One leader', correct: true },
            { id: 'b', text: 'Two leaders', correct: false },
          ],
        },
        conceptIds: [concept.id],
      },
      201,
    );
    const thread = await tutorThread(api);
    await send(thread, 'Quiz me on Raft');
    const first = toolsOf(await send(thread, 'A')).findLast(
      (part) => part.state === 'awaiting_approval',
    );
    await decide(thread, first?.approvalId ?? '', 'chat');
    await send(thread, 'next');
    // The second answer is recorded without asking again.
    const second = await send(thread, 'A');
    expect(toolsOf(second).findLast((part) => part.tool === 'record_answer')).toMatchObject({
      state: 'ok',
    });
    const detail = await api.get(`/api/mastery/concepts/${concept.id}`, ConceptMasteryDetailSchema);
    expect(detail.answers).toHaveLength(2);
  });
});

describe('checking my notes against the lectures', () => {
  it('flags what the lectures contradict as a suggestion, changes nothing, and applies it only when accepted', async () => {
    const { api, bed: testbed } = await setUp();
    await testbed.imported('raft.pptx', makePptx(SLIDES));
    const note = await api.post<{ id: string }>('/api/notes', {
      title: 'Raft notes',
      content:
        'Raft elects one leader per term.\n\nA leader needs a vote from all servers in the cluster.\n',
    });
    await testbed.settle();

    const thread = await tutorThread(api);
    const events = await send(thread, 'Check my notes on Raft against the lectures');
    const proposed = toolsOf(events).findLast((part) => part.tool === 'propose_note_correction');
    expect(proposed).toMatchObject({ state: 'ok', risk: 'write' });
    expect(textOf(events)).toContain('Nothing in your note has changed');

    // The note is untouched; the correction waits in the Inbox with the lecture's words as evidence.
    const unchanged = await api.get<{ content: string }>(`/api/notes/${note.id}`);
    expect(unchanged.content).toContain('all servers');
    const pending = await api.get<{
      proposals: {
        id: string;
        kind: string;
        payload: { text: string; replacement: string };
        evidence: { quote: string }[];
      }[];
    }>('/api/proposals?status=pending&kind=correction');
    expect(pending.proposals).toHaveLength(1);
    const [correction] = pending.proposals;
    expect(correction?.payload.text).toBe('A leader needs a vote from all servers in the cluster.');
    expect(correction?.payload.replacement).toContain('a majority of servers');
    expect(correction?.evidence[0]?.quote).toContain('majority of the servers');

    await api.post(`/api/proposals/${correction?.id}/accept`, {}, 200);
    const fixed = await api.get<{ content: string }>(`/api/notes/${note.id}`);
    expect(fixed.content).toContain(
      'A leader needs a vote from a majority of servers in the cluster.',
    );
    expect(fixed.content).not.toContain('all servers');
  });

  it('refuses a correction whose words are not in the note or whose quote is not in the source', async () => {
    const { api, bed: testbed } = await setUp();
    const imported = await testbed.imported('raft.pptx', makePptx(SLIDES));
    const note = await api.post<{ id: string }>('/api/notes', {
      title: 'Raft notes',
      content: 'A leader needs a vote from all servers.\n',
    });
    await testbed.settle();
    const registry = testbed.modules.agent.registry;
    const call = (input: Record<string, unknown>) =>
      registry.call('propose_note_correction', input, { actor: 'agent' });
    const base = {
      noteId: note.id,
      text: 'A leader needs a vote from all servers.',
      replacement: 'A leader needs a vote from a majority.',
      explanation: 'The lectures say a majority.',
      sourceId: imported.source.id,
      quote: 'A leader needs votes from a majority of the servers',
    };
    expect(await call({ ...base, text: 'Words that are not there.' })).toMatchObject({
      status: 'error',
    });
    expect(await call({ ...base, quote: 'The lectures never said this at all' })).toMatchObject({
      status: 'error',
    });
    expect(await call(base)).toMatchObject({ status: 'ok' });
  });
});

describe('the study plan, by asking', () => {
  it('makes a plan on request, lists it, and undoes it', async () => {
    const { api } = await setUp();
    const thread = await api.post(
      '/api/chat/threads',
      { mode: 'assistant', scope: 'knowledge' },
      201,
      ChatThreadSchema,
    );
    const made = await send(thread, 'Please make me a 5-day study plan');
    const created = toolsOf(made).findLast((part) => part.tool === 'create_study_plan');
    expect(created).toMatchObject({ state: 'ok', risk: 'write' });
    expect(textOf(made)).toContain('I made your plan');
    const Current = z.object({ plan: z.object({ id: z.string() }).nullable() });
    expect((await api.get('/api/plan', Current)).plan).not.toBeNull();

    const read = await send(thread, 'What is in my study plan?');
    expect(
      toolsOf(read).some((part) => part.tool === 'get_study_plan' && part.state === 'ok'),
    ).toBe(true);

    await api.post(`/api/agent/actions/${created?.actionId}/undo`, {}, 200);
    expect((await api.get('/api/plan', Current)).plan).toBeNull();
  });
});
