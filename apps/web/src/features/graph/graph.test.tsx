import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';

const PAXOS = 'con_01J9Z3K4M2Q8R5T7V9X1Y3Z5F1';
const RAFT = 'con_01J9Z3K4M2Q8R5T7V9X1Y3Z5F2';
const GOSSIP = 'con_01J9Z3K4M2Q8R5T7V9X1Y3Z5F3';
const NOTE = 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5F4';
const MODULE = 'mod_01J9Z3K4M2Q8R5T7V9X1Y3Z5F5';
const RELATION = 'rel_01J9Z3K4M2Q8R5T7V9X1Y3Z5F6';
const PROPOSAL = 'rel_01J9Z3K4M2Q8R5T7V9X1Y3Z5F7';
const now = '2026-10-09T10:00:00.000Z';

const node = (id: string, type: string, label: string, community: number | null, degree = 1) => ({
  id,
  type,
  label,
  community,
  degree,
  modules: ['COC251'],
  path: type === 'note' ? 'DS/Consensus notes.md' : null,
});
const edge = (id: string, source: string, target: string, relation: string, extra = {}) => ({
  id,
  source,
  target,
  relation,
  kind: relation === 'part_of' ? 'structure' : relation === 'mentioned_in' ? 'link' : 'relation',
  confidence: 'USER',
  status: 'accepted',
  score: null,
  weight: 1,
  relationId: null,
  ...extra,
});

const payload = {
  version: 3,
  nodes: [
    node(PAXOS, 'concept', 'Paxos', 0, 2),
    node(RAFT, 'concept', 'Raft', 0, 1),
    node(GOSSIP, 'concept', 'Gossip', null, 0),
    node(NOTE, 'note', 'Consensus notes', 0, 1),
    node(MODULE, 'module', 'COC251 Distributed Systems', null, 3),
  ],
  edges: [
    edge(RELATION, PAXOS, RAFT, 'prerequisite_for', { kind: 'relation', relationId: RELATION }),
    edge(`mentioned_in:${PAXOS}:${NOTE}`, PAXOS, NOTE, 'mentioned_in', { confidence: 'EXTRACTED' }),
    edge(`part_of:${PAXOS}:${MODULE}`, PAXOS, MODULE, 'part_of'),
  ],
  communities: [{ id: 0, label: 'Paxos', size: 3, cohesion: 0.667 }],
  matched: 5,
  truncated: false,
};

const ref = (id: string, type: string, label: string) => ({ id, type, label });
const report = {
  version: 3,
  coreConcepts: [{ node: ref(PAXOS, 'concept', 'Paxos'), degree: 2 }],
  communities: [
    { id: 0, label: 'Paxos', size: 3, cohesion: 0.667, hub: ref(PAXOS, 'concept', 'Paxos') },
  ],
  bridges: [],
  isolated: [ref(GOSSIP, 'concept', 'Gossip')],
  surprising: [],
  prompts: [
    {
      id: `gap:${GOSSIP}`,
      kind: 'gap',
      title: 'Connect “Gossip”',
      detail:
        'Nothing links to it yet: write about it in a note, or relate it to concepts you know.',
      actions: [{ label: 'Open concept', node: ref(GOSSIP, 'concept', 'Gossip'), view: 'page' }],
    },
  ],
};

const relation = (id: string, from: string, to: string, extra = {}) => ({
  id,
  from: ref(from, 'concept', from === PAXOS ? 'Paxos' : 'Raft'),
  to: ref(to, 'concept', to === RAFT ? 'Raft' : 'Paxos'),
  relation: 'prerequisite_for',
  confidence: 'USER',
  score: null,
  status: 'accepted',
  evidence: [],
  createdBy: 'user',
  createdAt: now,
  updatedAt: now,
  ...extra,
});

const concept = (id: string, name: string) => ({
  id,
  name,
  slug: name.toLowerCase(),
  aliases: [],
  summary: '',
  importance: 1,
  moduleIds: [MODULE],
  topicIds: [],
  noteId: null,
  mentionCount: 0,
  createdAt: now,
  updatedAt: now,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeServer() {
  const calls: { method: string; url: URL; body: unknown }[] = [];
  const fetch: FakeFetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, url, body });
    const path = url.pathname;
    if (path === '/api/health') return json(HEALTH);
    if (path === '/api/graph') return json(payload);
    if (path === '/api/graph/report') return json(report);
    if (path === '/api/graph/local') return json(payload);
    if (path === '/api/graph/path')
      return json({
        found: true,
        nodes: [payload.nodes[0], payload.nodes[3]],
        edges: [payload.edges[1]],
      });
    if (path === '/api/modules') return json({ modules: [] });
    if (path === '/api/concepts')
      return json({ concepts: [concept(PAXOS, 'Paxos'), concept(RAFT, 'Raft')] });
    if (path === '/api/notes')
      return json({
        notes: [],
        folders: [],
        attachments: [],
        index: {
          state: 'ready',
          notes: 0,
          attachments: 0,
          processed: 0,
          total: 0,
          lastScanAt: null,
          lastScanMs: null,
        },
      });
    if (path.startsWith('/api/concepts/')) {
      const id = path.split('/').pop() as string;
      const name = id === RAFT ? 'Raft' : id === GOSSIP ? 'Gossip' : 'Paxos';
      return json({
        ...concept(id, name),
        modules: [],
        topics: [],
        note: null,
        mentions: [],
        passages: [],
      });
    }
    if (path === '/api/relations' && method === 'GET')
      return json({
        relations: [
          relation(RELATION, PAXOS, RAFT),
          relation(PROPOSAL, RAFT, PAXOS, {
            relation: 'contrasts_with',
            confidence: 'INFERRED',
            score: 0.6,
            status: 'proposed',
            createdBy: 'ai',
            evidence: [{ quote: 'Raft is easier to follow than Paxos.' }],
          }),
        ],
      });
    if (path === '/api/relations' && method === 'POST')
      return json(relation('rel_01J9Z3K4M2Q8R5T7V9X1Y3Z5F8', body.from, body.to), 201);
    if (path.startsWith('/api/relations/') && method === 'PATCH')
      return json(relation(PROPOSAL, RAFT, PAXOS, body));
    return json(
      { type: 'urn:skb:problem:not_found', title: 'Not found', status: 404, code: 'not_found' },
      404,
    );
  };
  return { fetch, calls };
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => resetUiState());

describe('graph page', () => {
  it('suggests what to study, with actions that lead somewhere', async () => {
    const server = fakeServer();
    renderApp('/graph', server.fetch);
    expect(await screen.findByRole('heading', { level: 1, name: 'Graph' })).toBeInTheDocument();
    // jsdom has no WebGL: the page says so and its lists carry the information.
    expect(await screen.findByText(/cannot draw the graph/)).toBeInTheDocument();
    const prompts = await screen.findByRole('list', { name: 'Study prompts' });
    expect(within(prompts).getByText('Connect “Gossip”')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Gaps' })).getByText('Gossip'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Paxos/, pressed: true })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(prompts).getByRole('button', { name: 'Open concept' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Gossip' })).toBeInTheDocument();
  });

  it('finds a node, shows its connections and a path to another', async () => {
    const server = fakeServer();
    renderApp('/graph', server.fetch);
    const user = userEvent.setup();
    await user.type(await screen.findByRole('combobox', { name: 'Find in graph' }), 'pax');
    await user.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByRole('heading', { level: 3, name: 'Paxos' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'is a prerequisite for' })).getByText('Raft'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'is mentioned in' })).getByText('Consensus notes'),
    ).toBeInTheDocument();

    await user.type(screen.getByRole('combobox', { name: 'Find a path to' }), 'Consensus notes');
    await user.click(screen.getAllByRole('button', { name: 'Find' })[1] as HTMLElement);
    const path = await screen.findByRole('list', { name: 'Path' });
    expect(
      within(path)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Paxos', 'Consensus notes']);
    expect(server.calls.some((call) => call.url.pathname === '/api/graph/path')).toBe(true);
  });

  it('asks the server for the types chosen', async () => {
    const server = fakeServer();
    renderApp('/graph', server.fetch);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Notes' }));
    await waitFor(() =>
      expect(
        server.calls
          .filter((call) => call.url.pathname === '/api/graph')
          .some((call) => !call.url.searchParams.getAll('types').includes('note')),
      ).toBe(true),
    );
    await user.click(screen.getByRole('button', { name: /Paxos/, pressed: true }));
    expect(screen.getByRole('button', { name: /Paxos/, pressed: false })).toBeInTheDocument();
  });
});

describe('relations on a concept page', () => {
  it('lists relations both ways, accepts a proposal and adds a relation', async () => {
    const server = fakeServer();
    renderApp(`/concepts/${PAXOS}`, server.fetch);
    const list = await screen.findByRole('list', { name: 'Relations' });
    expect(within(list).getByText('is a prerequisite for')).toBeInTheDocument();
    expect(within(list).getByText('contrasts with')).toBeInTheDocument();
    expect(within(list).getByText('proposed')).toBeInTheDocument();
    expect(within(list).getByText(/suggested by the assistant/)).toBeInTheDocument();
    expect(within(list).getByText('“Raft is easier to follow than Paxos.”')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(within(list).getByRole('button', { name: 'Accept: contrasts with Raft' }));
    await waitFor(() =>
      expect(server.calls.find((call) => call.method === 'PATCH')).toMatchObject({
        body: { status: 'accepted', confidence: 'USER' },
      }),
    );

    await user.selectOptions(screen.getByRole('combobox', { name: 'Relation' }), 'depends on');
    await user.type(screen.getByRole('combobox', { name: 'Related concept' }), 'raft');
    await user.click(screen.getByRole('button', { name: 'Add relation' }));
    await waitFor(() =>
      expect(server.calls.find((call) => call.method === 'POST')?.body).toEqual({
        from: RAFT,
        to: PAXOS,
        relation: 'prerequisite_for',
      }),
    );
    // The neighbourhood is listed under the graph.
    expect(screen.getByRole('button', { name: '1 step', pressed: true })).toBeInTheDocument();
  });
});
