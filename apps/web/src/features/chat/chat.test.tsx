import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, notFound } from '../../test/practice-fixtures';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';
import { resetChatState } from './chat-store';

const SOURCE = 'src_01J9Z3K4M2Q8R5T7V9X1Y3Z5H1';
const THREAD = 'thr_01J9Z3K4M2Q8R5T7V9X1Y3Z5T1';
const OTHER = 'thr_01J9Z3K4M2Q8R5T7V9X1Y3Z5T2';
const NOW = '2026-10-10T09:00:00.000Z';

const role = (ready: boolean, reason: string | null, label: string | null = null) => ({
  ready,
  reason,
  label,
});
const status = (enabled: boolean) => ({
  enabled,
  mock: false,
  roles: {
    chat: enabled
      ? role(true, null, 'OpenAI · gpt-test')
      : role(false, 'Choose a provider and model for answers.'),
    fast: role(false, 'Choose a provider and model for quick tasks.'),
    embedding: role(false, 'Choose a provider and model for semantic search.'),
    transcription: role(false, 'Choose a provider and model for transcribing recordings.'),
  },
  month: {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    budget: 10,
    warning: false,
    exhausted: false,
  },
});

const usage = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
const thread = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  mode: 'assistant',
  scope: 'knowledge',
  filter: {},
  allowedTools: [],
  messageCount: 0,
  awaitingApproval: false,
  compacted: false,
  usage,
  createdAt: NOW,
  updatedAt: NOW,
  ...extra,
});
const message = (id: string, role: 'user' | 'assistant', parts: unknown[], mentions = []) => ({
  id,
  role,
  parts,
  mentions,
  createdAt: NOW,
});
const tool = (
  callId: string,
  name: string,
  state: string,
  extra: Record<string, unknown> = {},
) => ({
  type: 'tool',
  callId,
  tool: name,
  state,
  summary: name,
  risk: 'read',
  actionId: null,
  reason: null,
  input: {},
  output: null,
  approvalId: null,
  canAllowForChat: false,
  ...extra,
});

const PASSAGE = {
  key: 'S1',
  kind: 'source',
  title: 'Lecture 3',
  label: 'p. 4',
  locator: { kind: 'pdf', sourceId: SOURCE, page: 4 },
  text: 'Raft elects a leader for each term.',
};

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

interface ServerOptions {
  enabled?: boolean;
  threads?: ReturnType<typeof thread>[];
  details?: Record<string, ReturnType<typeof thread> & { messages: unknown[] }>;
  /** NDJSON lines the next message stream sends. */
  stream?: unknown[];
  approvals?: unknown[];
}

const ndjson = (lines: unknown[]) =>
  new Response(lines.map((line) => JSON.stringify(line)).join('\n'), {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  });

function fakeServer(options: ServerOptions = {}) {
  const calls: Call[] = [];
  const threads = [...(options.threads ?? [])];
  const details = { ...(options.details ?? {}) };
  const fetch: FakeFetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, path: url.pathname, body });
    const path = url.pathname;
    if (path === '/api/health') return json(HEALTH);
    if (path === '/api/ai/status') return json(status(options.enabled ?? false));
    if (path === '/api/agent/actions') return json({ actions: [] });
    if (path === '/api/chat/threads' && method === 'GET') {
      const q = url.searchParams.get('q')?.toLowerCase();
      return json({
        threads: q ? threads.filter((entry) => entry.title.toLowerCase().includes(q)) : threads,
      });
    }
    if (path === '/api/chat/threads' && method === 'POST') {
      const created = thread(THREAD, 'New chat', body ?? {});
      threads.unshift(created);
      details[THREAD] = { ...created, messages: [] };
      return json(created, 201);
    }
    const match = path.match(/^\/api\/chat\/threads\/([^/]+)(\/messages|\/approvals)?$/u);
    if (match) {
      const id = match[1] ?? '';
      if (match[2] === '/messages') return ndjson(options.stream ?? []);
      if (match[2] === '/approvals') return ndjson(options.approvals ?? []);
      if (method === 'GET') {
        const detail = details[id];
        return detail ? json(detail) : notFound();
      }
      if (method === 'PATCH') {
        const found = threads.find((entry) => entry.id === id);
        if (!found) return notFound();
        Object.assign(found, body);
        return json(found);
      }
      if (method === 'DELETE') {
        threads.splice(
          threads.findIndex((entry) => entry.id === id),
          1,
        );
        return json({ ok: true });
      }
    }
    if (path === '/api/notes/tree' || path === '/api/tree') return json({ notes: [], folders: [] });
    return notFound();
  };
  return {
    fetch,
    calls,
    find: (method: string, path: string) =>
      calls.filter((c) => c.method === method && c.path === path),
  };
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => {
  resetUiState();
  resetChatState();
});

describe('the chat panel', () => {
  it('explains how to set up AI when there is no model, and the rest still works', async () => {
    const user = userEvent.setup();
    renderApp('/', fakeServer().fetch);
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    await user.keyboard('{Control>}j{/Control}');
    const panel = await screen.findByRole('complementary', { name: 'Chat panel' });
    expect(
      await within(panel).findByText(/Choose a provider and model for answers/u),
    ).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Set up AI in Settings' })).toHaveAttribute(
      'href',
      '/settings',
    );
    expect(within(panel).getByRole('textbox', { name: 'Message' })).toBeDisabled();
    // The page beside the panel is still there and usable; Escape closes the panel.
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('complementary', { name: 'Chat panel' })).not.toBeInTheDocument(),
    );
  });

  it('answers about the page it is opened on, with citations that open the passage', async () => {
    const user = userEvent.setup();
    const answer = message('msg_01J9Z3K4M2Q8R5T7V9X1Y3Z5M2', 'assistant', [
      { type: 'passages', passages: [PASSAGE] },
      { type: 'text', text: 'Raft elects a leader for each term [S1].' },
      { type: 'grounding', grounding: 'sources', cited: ['S1'], dropped: [] },
    ]);
    const asked = message('msg_01J9Z3K4M2Q8R5T7V9X1Y3Z5M1', 'user', [
      { type: 'text', text: 'How does Raft elect a leader?' },
    ]);
    const server = fakeServer({
      enabled: true,
      stream: [
        { type: 'user', message: asked },
        { type: 'assistant', id: answer.id, createdAt: NOW },
        { type: 'passages', passages: [PASSAGE] },
        { type: 'text', delta: 'Raft elects a leader ' },
        { type: 'text', delta: 'for each term [S1].' },
        {
          type: 'done',
          message: answer,
          thread: thread(THREAD, 'How does Raft elect a leader?', {
            messageCount: 2,
            usage: { requests: 1, inputTokens: 1200, outputTokens: 40, cost: 0.0042 },
          }),
        },
      ],
    });
    // The server saves what was streamed; the thread read back after the run has both messages.
    const originalFetch = server.fetch;
    let ran = false;
    const fetch: FakeFetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (String(input).endsWith('/messages')) ran = true;
      if (
        ran &&
        String(input).endsWith(`/api/chat/threads/${THREAD}`) &&
        (init?.method ?? 'GET') === 'GET'
      ) {
        return json({
          ...thread(THREAD, 'How does Raft elect a leader?', {
            messageCount: 2,
            usage: { requests: 1, inputTokens: 1200, outputTokens: 40, cost: 0.0042 },
          }),
          messages: [asked, answer],
        });
      }
      return response;
    };
    renderApp(`/library/${SOURCE}`, fetch);
    await user.click(await screen.findByRole('button', { name: /Chat…/u }));
    const panel = await screen.findByRole('complementary', { name: 'Chat panel' });
    // On a source's page, the question is about that source unless widened.
    expect(await within(panel).findByRole('checkbox', { name: 'Only this source' })).toBeChecked();
    await user.type(
      within(panel).getByRole('textbox', { name: 'Message' }),
      'How does Raft elect a leader?',
    );
    await user.click(within(panel).getByRole('button', { name: /^Send/u }));

    const reply = await within(panel).findByRole('article', { name: 'Assistant' });
    expect(await within(reply).findByText('From your sources')).toBeInTheDocument();
    const citation = within(reply).getByRole('link', { name: '[S1]' });
    expect(citation).toHaveAttribute('href', `/library/${SOURCE}?page=4`);
    expect(within(reply).getByText('Passages used (1)')).toBeInTheDocument();
    expect(await within(panel).findByText(/1,200 tokens in/u)).toBeInTheDocument();

    expect(server.find('POST', '/api/chat/threads')[0]?.body).toMatchObject({
      mode: 'assistant',
      scope: 'knowledge',
    });
    expect(server.find('POST', `/api/chat/threads/${THREAD}/messages`)[0]?.body).toMatchObject({
      text: 'How does Raft elect a leader?',
      onlyThisPage: true,
      context: { label: 'viewing this source', filter: { sourceIds: [SOURCE] } },
    });
    // Following a citation leaves the panel open beside the passage.
    await user.click(citation);
    await waitFor(() => expect(window.location.pathname).toBeDefined());
    expect(screen.getByRole('complementary', { name: 'Chat panel' })).toBeInTheDocument();
  });
});

describe('activity and approvals', () => {
  const waitingDetail = (risk: 'write' | 'destructive') => {
    const approvalId = 'aitxt-approval-1';
    const parts = [
      tool('call_1', 'list_notes', 'ok', { summary: 'Listed 1 notes' }),
      tool('call_2', risk === 'destructive' ? 'delete_note' : 'create_note', 'awaiting_approval', {
        summary: risk === 'destructive' ? 'Delete the note “Scratch”' : 'Create the note “Plan”',
        risk,
        reason:
          risk === 'destructive' ? 'Deleting always asks.' : 'You asked to approve every change.',
        approvalId,
        canAllowForChat: risk !== 'destructive',
      }),
    ];
    return {
      approvalId,
      detail: {
        ...thread(THREAD, 'Tidy up', { awaitingApproval: true, messageCount: 2 }),
        messages: [
          message('msg_01J9Z3K4M2Q8R5T7V9X1Y3Z5M1', 'user', [
            { type: 'text', text: 'Delete Scratch' },
          ]),
          message('msg_01J9Z3K4M2Q8R5T7V9X1Y3Z5M2', 'assistant', parts),
        ],
      },
    };
  };

  it('shows activity rows and a destructive approval that can only be given once', async () => {
    const user = userEvent.setup();
    const { approvalId, detail } = waitingDetail('destructive');
    const done = message('msg_01J9Z3K4M2Q8R5T7V9X1Y3Z5M2', 'assistant', [
      tool('call_1', 'list_notes', 'ok', { summary: 'Listed 1 notes' }),
      tool('call_2', 'delete_note', 'declined', {
        summary: 'Delete the note “Scratch”',
        risk: 'destructive',
      }),
      { type: 'text', text: 'Understood, I left it alone.' },
    ]);
    const server = fakeServer({
      enabled: true,
      threads: [detail],
      details: { [THREAD]: detail },
      approvals: [
        { type: 'assistant', id: done.id, createdAt: NOW },
        { type: 'tool', part: done.parts[1] },
        { type: 'text', delta: 'Understood, I left it alone.' },
        { type: 'done', message: done, thread: { ...detail, awaitingApproval: false } },
      ],
    });
    renderApp(`/chat/${THREAD}`, server.fetch);
    const activity = await screen.findByRole('list', { name: 'Assistant activity' });
    expect(within(activity).getByText('Listed 1 notes')).toBeInTheDocument();
    const card = within(activity).getByRole('listitem', {
      name: 'Approval needed: Delete the note “Scratch”',
    });
    expect(within(card).getByText('Deleting always asks.')).toBeInTheDocument();
    // A destructive call is never approved for the rest of the chat, and nothing can be sent yet.
    expect(within(card).queryByRole('button', { name: 'Approve for this chat' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled();

    await user.click(within(card).getByRole('button', { name: 'Decline' }));
    await waitFor(() =>
      expect(server.find('POST', `/api/chat/threads/${THREAD}/approvals`)).toHaveLength(1),
    );
    expect(server.find('POST', `/api/chat/threads/${THREAD}/approvals`)[0]?.body).toEqual({
      decisions: [{ approvalId, decision: 'decline' }],
    });
  });

  it('offers to approve a change for the rest of the chat', async () => {
    const user = userEvent.setup();
    const { approvalId, detail } = waitingDetail('write');
    const server = fakeServer({
      enabled: true,
      threads: [detail],
      details: { [THREAD]: detail },
      approvals: [],
    });
    renderApp(`/chat/${THREAD}`, server.fetch);
    const card = await screen.findByRole('listitem', {
      name: 'Approval needed: Create the note “Plan”',
    });
    await user.click(within(card).getByRole('button', { name: 'Approve for this chat' }));
    await waitFor(() =>
      expect(server.find('POST', `/api/chat/threads/${THREAD}/approvals`)).toHaveLength(1),
    );
    expect(server.find('POST', `/api/chat/threads/${THREAD}/approvals`)[0]?.body).toEqual({
      decisions: [{ approvalId, decision: 'chat' }],
    });
  });

  it('opens what the assistant made and offers Undo', async () => {
    const detail = {
      ...thread(THREAD, 'Cards', { messageCount: 2 }),
      messages: [
        message('msg_01J9Z3K4M2Q8R5T7V9X1Y3Z5M1', 'user', [{ type: 'text', text: 'Make cards' }]),
        message('msg_01J9Z3K4M2Q8R5T7V9X1Y3Z5M2', 'assistant', [
          tool('call_1', 'create_flashcards', 'ok', {
            summary: 'Created 12 flashcards in “CS301 · L1–L3”',
            risk: 'write',
            actionId: 'act_01J9Z3K4M2Q8R5T7V9X1Y3Z5A1',
            output: { setId: 'set_01J9Z3K4M2Q8R5T7V9X1Y3Z5S1', cardIds: [], status: 'draft' },
          }),
          { type: 'text', text: 'I made 12 flashcards.' },
        ]),
      ],
    };
    const server = fakeServer({ enabled: true, threads: [detail], details: { [THREAD]: detail } });
    const base = server.fetch;
    const fetch: FakeFetch = async (input, init) => {
      if (String(input).includes('/api/agent/actions'))
        return json({
          actions: [
            {
              id: 'act_01J9Z3K4M2Q8R5T7V9X1Y3Z5A1',
              tool: 'create_flashcards',
              risk: 'write',
              actor: 'agent',
              status: 'executed',
              approval: 'auto',
              summary: 'Created 12 flashcards',
              input: {},
              output: {},
              error: null,
              createdAt: NOW,
              undoneAt: null,
              undoable: true,
            },
          ],
        });
      return base(input, init);
    };
    renderApp(`/chat/${THREAD}`, fetch);
    const row = (await screen.findByText('Created 12 flashcards in “CS301 · L1–L3”')).closest('li');
    expect(row).not.toBeNull();
    const inRow = within(row as HTMLElement);
    expect(await inRow.findByRole('link', { name: 'Review in the Inbox' })).toHaveAttribute(
      'href',
      '/inbox',
    );
    expect(await inRow.findByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });
});

describe('the chat page', () => {
  it('lists, searches, renames and deletes conversations', async () => {
    const user = userEvent.setup();
    const server = fakeServer({
      enabled: true,
      threads: [thread(THREAD, 'Raft revision'), thread(OTHER, 'Paxos questions')],
      details: { [THREAD]: { ...thread(THREAD, 'Raft revision'), messages: [] } },
    });
    renderApp('/chat', server.fetch);
    const list = await screen.findByRole('list', { name: 'Conversations' });
    await waitFor(() => expect(within(list).getAllByRole('link')).toHaveLength(2));
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      expect.stringContaining('Raft revision'),
      expect.stringContaining('Paxos questions'),
    ]);

    await user.type(screen.getByRole('searchbox', { name: 'Search conversations' }), 'paxos');
    await waitFor(() => expect(within(list).getAllByRole('link')).toHaveLength(1));
    await user.clear(screen.getByRole('searchbox', { name: 'Search conversations' }));
    await waitFor(() => expect(within(list).getAllByRole('link')).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: 'Actions for Raft revision' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename conversation' });
    await user.clear(within(dialog).getByRole('textbox', { name: 'Title' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Title' }), 'Leader election');
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));
    await waitFor(() =>
      expect(server.find('PATCH', `/api/chat/threads/${THREAD}`)[0]?.body).toEqual({
        title: 'Leader election',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Actions for Paxos questions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete this conversation?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(server.find('DELETE', `/api/chat/threads/${OTHER}`)).toHaveLength(1),
    );
  });

  it('works without AI: history is readable and the message box says why it is off', async () => {
    const detail = {
      ...thread(THREAD, 'Old chat', { messageCount: 2 }),
      messages: [
        message('msg_01J9Z3K4M2Q8R5T7V9X1Y3Z5M1', 'user', [
          { type: 'text', text: 'What is a term?' },
        ]),
        message('msg_01J9Z3K4M2Q8R5T7V9X1Y3Z5M2', 'assistant', [
          { type: 'text', text: 'A term is a period with one leader.' },
        ]),
      ],
    };
    renderApp(
      `/chat/${THREAD}`,
      fakeServer({ enabled: false, threads: [detail], details: { [THREAD]: detail } }).fetch,
    );
    expect(await screen.findByText('A term is a period with one leader.')).toBeInTheDocument();
    expect(await screen.findByPlaceholderText(/Chat needs an AI model/u)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled();
  });
});
