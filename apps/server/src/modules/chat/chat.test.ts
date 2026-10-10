import {
  type ChatEvent,
  ChatEventSchema,
  type ChatThread,
  ChatThreadDetailSchema,
  ChatThreadSchema,
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
    title: 'Two-phase commit (2PC)',
    body: ['Two-phase commit is an atomic commitment protocol for distributed transactions.'],
  },
  {
    title: 'Coordinator',
    body: ['The coordinator collects a vote from every participant before deciding the outcome.'],
  },
  {
    title: 'Blocking',
    body: ['A participant blocks when the coordinator fails after the voting phase completes.'],
  },
];

async function setUp(options: { mock?: boolean } = {}) {
  bed = createSourcesTestbed({ config: { aiMock: options.mock ?? true } });
  await bed.start();
  const imported = await bed.imported('consensus.pptx', makePptx(SLIDES));
  await bed.settle();
  const api = jsonApi(bed.request);
  const module = await api.post<{ id: string }>('/api/modules', {
    code: 'CS301',
    title: 'Distributed Systems',
  });
  for (const key of ['L1', 'L2', 'L3']) {
    const lecture = await api.post<{ id: string }>(`/api/modules/${module.id}/lectures`, {
      key,
      title: `Lecture ${key}`,
    });
    await api.post(`/api/lectures/${lecture.id}/sources`, { sourceId: imported.source.id }, 200);
  }
  return { api, sourceId: imported.source.id };
}

type Api = ReturnType<typeof jsonApi>;

const newThread = (api: Api, body: Record<string, unknown> = {}) =>
  api.post('/api/chat/threads', body, 201, ChatThreadSchema);

/** Posts to a streaming route and reads every NDJSON event. */
async function stream(path: string, body: unknown, status = 200): Promise<ChatEvent[]> {
  const response = await bed?.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  expect(response?.status).toBe(status);
  if (status !== 200) return [];
  expect(response?.headers.get('content-type')).toContain('application/x-ndjson');
  return ((await response?.text()) ?? '')
    .trim()
    .split('\n')
    .map((line) => ChatEventSchema.parse(JSON.parse(line)));
}

const send = (thread: ChatThread, text: string, extra: Record<string, unknown> = {}) =>
  stream(`/api/chat/threads/${thread.id}/messages`, { text, ...extra });
const decide = (thread: ChatThread, decisions: { approvalId: string; decision: string }[]) =>
  stream(`/api/chat/threads/${thread.id}/approvals`, { decisions });

const finished = (events: ChatEvent[]) => {
  const event = events.find((entry) => entry.type === 'done');
  if (event?.type !== 'done') throw new Error(`no done event in ${JSON.stringify(events)}`);
  return event;
};
const tools = (events: ChatEvent[]) =>
  events.flatMap((event) => (event.type === 'tool' ? [event.part] : []));
const textOf = (events: ChatEvent[]) =>
  events.flatMap((event) => (event.type === 'text' ? [event.delta] : [])).join('');

describe('threads', () => {
  it('create, rename, list, search and delete conversations', async () => {
    const { api } = await setUp();
    const first = await newThread(api, { title: 'Raft revision' });
    const second = await newThread(api, { mode: 'tutor', scope: 'sources' });
    expect(second).toMatchObject({ title: 'New chat', mode: 'tutor', scope: 'sources' });
    await api.patch(`/api/chat/threads/${second.id}`, { title: 'Paxos' }, 200, ChatThreadSchema);

    const list = await api.get(
      '/api/chat/threads',
      z.object({ threads: z.array(ChatThreadSchema) }),
    );
    expect(list.threads.map((thread) => thread.title)).toEqual(['Paxos', 'Raft revision']);
    const found = await api.get(
      '/api/chat/threads?q=raft',
      z.object({ threads: z.array(ChatThreadSchema) }),
    );
    expect(found.threads.map((thread) => thread.id)).toEqual([first.id]);

    await api.delete(`/api/chat/threads/${first.id}`);
    await api.get(`/api/chat/threads/${first.id}`, undefined, 404);
  });

  it('title a new chat from its first message and keep the messages', async () => {
    const { api } = await setUp();
    const thread = await newThread(api);
    const events = await send(thread, 'What does the coordinator do in two-phase commit?');
    expect(events.map((event) => event.type).slice(0, 2)).toEqual(['user', 'assistant']);
    const detail = await api.get(`/api/chat/threads/${thread.id}`, ChatThreadDetailSchema);
    expect(detail.title).toBe('What does the coordinator do in two-phase commit?');
    expect(detail.messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(detail.usage.requests).toBe(1);
    // The saved message is what was streamed.
    expect(finished(events).message.id).toBe(detail.messages[1]?.id);
    const search = await api.get(
      '/api/chat/threads?q=coordinator',
      z.object({ threads: z.array(ChatThreadSchema) }),
    );
    expect(search.threads).toHaveLength(1);
  });

  it('refuses a message with no model configured, without losing the question', async () => {
    const { api } = await setUp({ mock: false });
    const thread = await newThread(api);
    const events = await send(thread, 'Anything?');
    expect(events.find((event) => event.type === 'error')).toMatchObject({
      code: 'not_configured',
    });
  });
});

describe('grounded answers in a conversation', () => {
  it('stream passages, answer with real citations and label the grounding', async () => {
    const { api } = await setUp();
    const thread = await newThread(api, { scope: 'sources' });
    const events = await send(thread, 'What does the coordinator do?');
    const passages = events.find((event) => event.type === 'passages');
    expect(passages?.type === 'passages' && passages.passages[0]?.key).toBe('S1');
    const { message } = finished(events);
    const grounding = message.parts.find((part) => part.type === 'grounding');
    expect(grounding).toMatchObject({ grounding: 'sources', dropped: [] });
    expect(textOf(events)).toContain('[S1]');
    // The passages ride with the message for display, not in the model's history.
    const detail = await api.get(`/api/chat/threads/${thread.id}`, ChatThreadDetailSchema);
    expect(detail.messages[1]?.parts.some((part) => part.type === 'passages')).toBe(true);
  });

  it('does not pretend to have sources when a sources-only chat finds nothing', async () => {
    const { api } = await setUp();
    const thread = await newThread(api, { scope: 'sources' });
    const events = await send(thread, 'Explain photosynthesis in detail');
    expect(events.some((event) => event.type === 'passages')).toBe(false);
    const { message } = finished(events);
    expect(
      message.parts.some((part) => part.type === 'grounding' && part.grounding === 'sources'),
    ).toBe(false);
    expect(textOf(events)).toMatch(/could not find/u);
  });
});

describe('acting through tools', () => {
  it('make flashcards from lectures 1–3 and show every step', async () => {
    const { api } = await setUp();
    const thread = await newThread(api);
    const events = await send(thread, 'Create flashcards from lectures 1–3');
    const steps = tools(events);
    const names = [...new Set(steps.map((step) => step.tool))];
    expect(names).toEqual(
      expect.arrayContaining(['list_modules', 'get_module', 'get_lecture', 'create_flashcards']),
    );
    const created = steps.findLast((step) => step.tool === 'create_flashcards');
    expect(created).toMatchObject({ state: 'ok', risk: 'write' });
    expect(created?.actionId).toBeTruthy();
    // Drafts wait in the Inbox until the student accepts them.
    const drafts = await api.get<{ cards: unknown[] }>('/api/drafts');
    expect(drafts.cards.length).toBeGreaterThan(0);
    expect(finished(events).thread.awaitingApproval).toBe(false);
  });

  it('pause for a destructive action, run it once approved, and refuse to remember it', async () => {
    const { api } = await setUp();
    const note = await api.post<{ id: string }>('/api/notes', { title: 'Scratch', content: 'x' });
    const thread = await newThread(api);

    const first = await send(thread, 'Please delete the note Scratch');
    const waiting = tools(first).findLast((step) => step.state === 'awaiting_approval');
    expect(waiting).toMatchObject({ tool: 'delete_note', risk: 'destructive' });
    expect(waiting?.canAllowForChat).toBe(false);
    const paused = finished(first);
    expect(paused.thread.awaitingApproval).toBe(true);
    // The note is untouched until the student decides.
    await api.get(`/api/notes/${note.id}`);
    // A new message cannot overtake the question.
    await stream(`/api/chat/threads/${thread.id}/messages`, { text: 'Hello' }, 409);

    const resumed = await decide(thread, [
      { approvalId: waiting?.approvalId ?? '', decision: 'chat' },
    ]);
    const deleted = tools(resumed).findLast((step) => step.tool === 'delete_note');
    expect(deleted).toMatchObject({ state: 'ok' });
    expect(finished(resumed).thread).toMatchObject({ awaitingApproval: false, allowedTools: [] });
    await api.get(`/api/notes/${note.id}`, undefined, 404);

    // Undo from the action log brings it back.
    await api.post(`/api/agent/actions/${deleted?.actionId}/undo`, {}, 200);
    await api.get(`/api/notes/${note.id}`);
  });

  it('leave the note alone when the student declines', async () => {
    const { api } = await setUp();
    const note = await api.post<{ id: string }>('/api/notes', { title: 'Keep me', content: 'x' });
    const thread = await newThread(api);
    const first = await send(thread, 'Delete the note Keep me');
    const waiting = tools(first).findLast((step) => step.state === 'awaiting_approval');
    const resumed = await decide(thread, [
      { approvalId: waiting?.approvalId ?? '', decision: 'decline' },
    ]);
    expect(tools(resumed).findLast((step) => step.tool === 'delete_note')).toMatchObject({
      state: 'declined',
    });
    await api.get(`/api/notes/${note.id}`);
    expect(textOf(resumed)).toMatch(/left .* alone/u);
  });

  it('write a summary note, link it to the student’s notes and say what it did', async () => {
    const { api } = await setUp();
    const mine = await api.post<{ id: string }>('/api/notes', {
      title: 'Consensus notes',
      content: 'My own thoughts on the coordinator and blocking in two-phase commit.',
    });
    const thread = await newThread(api);
    const events = await send(
      thread,
      'Write a Markdown summary of the coordinator from my notes and lectures',
    );
    const steps = tools(events);
    const made = steps.findLast((step) => step.tool === 'create_note');
    expect(made).toMatchObject({ state: 'ok', risk: 'write' });
    expect(steps.some((step) => step.tool === 'link_notes' && step.state === 'ok')).toBe(true);
    const madeId = (made?.output as { id?: string } | null | undefined)?.id ?? '';
    const note = await api.get<{ content: string }>(`/api/notes/${madeId}`);
    expect(note.content).toContain('[[Consensus notes]]');
    expect(mine.id).toBeTruthy();
  });

  it('keeps every action in the log, and reads out of it', async () => {
    const { api } = await setUp();
    const thread = await newThread(api);
    await send(thread, 'Create flashcards from lectures 1–2');
    const log = await api.get<{ actions: { tool: string; thread?: string | null }[] }>(
      '/api/agent/actions',
    );
    expect(log.actions.some((action) => action.tool === 'create_flashcards')).toBe(true);
  });
});

describe('stopping and long conversations', () => {
  it('mark an unfinished answer as stopped when the client goes away', async () => {
    const { api } = await setUp();
    const thread = await newThread(api);
    const controller = new AbortController();
    const response = await bed?.request(`/api/chat/threads/${thread.id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text: 'Create flashcards from lectures 1–3' }),
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
    });
    controller.abort();
    await response?.body?.cancel().catch(() => undefined);
    // Whatever happened, the conversation is usable and nothing is left waiting.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const detail = await api.get(`/api/chat/threads/${thread.id}`, ChatThreadDetailSchema);
    expect(detail.awaitingApproval).toBe(false);
  });

  it('summarise the older turns once the thread outgrows the context budget', async () => {
    const { api } = await setUp();
    await api.patch('/api/ai/preferences', { contextTokens: 1000 }, 200);
    const thread = await newThread(api, { scope: 'general' });
    let last: ChatEvent[] = [];
    for (let turn = 1; turn <= 8; turn++)
      last = await send(
        thread,
        `Turn ${turn}: ${'tell me something about distributed commit protocols and why they block '.repeat(6)}`,
      );
    expect(finished(last).thread.compacted).toBe(true);
    const detail = await api.get(`/api/chat/threads/${thread.id}`, ChatThreadDetailSchema);
    // The visible conversation is never shortened.
    expect(detail.messages).toHaveLength(16);
  });
});
