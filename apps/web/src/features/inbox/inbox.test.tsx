import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchServerEvent } from '../../lib/events';
import { json, notFound, question } from '../../test/practice-fixtures';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';
import { useGenerationJobs } from './generation-jobs';

const now = '2026-10-09T10:00:00.000Z';
const SOURCE = 'src_01J9Z3K4M2Q8R5T7V9X1Y3Z5J1';
const SET = 'set_01J9Z3K4M2Q8R5T7V9X1Y3Z5J2';
const CARD = 'card_01J9Z3K4M2Q8R5T7V9X1Y3Z5J3';
const QUESTION = 'qst_01J9Z3K4M2Q8R5T7V9X1Y3Z5J4';
const CONCEPT_PROPOSAL = 'prp_01J9Z3K4M2Q8R5T7V9X1Y3Z5J5';
const RELATION_PROPOSAL = 'prp_01J9Z3K4M2Q8R5T7V9X1Y3Z5J6';
const PAXOS = 'con_01J9Z3K4M2Q8R5T7V9X1Y3Z5J7';
const MODULE = 'mod_01J9Z3K4M2Q8R5T7V9X1Y3Z5J8';
const LECTURE = 'lec_01J9Z3K4M2Q8R5T7V9X1Y3Z5J9';
const JOB = 'job_01J9Z3K4M2Q8R5T7V9X1Y3Z5JA';

const slide = (number: number) => ({
  kind: 'slides',
  sourceId: SOURCE,
  slide: number,
  part: 'body',
});

const draftCard = {
  id: CARD,
  setId: SET,
  kind: 'basic',
  front: 'What does two-phase commit guarantee?',
  back: 'Atomic commitment.',
  extra: '',
  status: 'draft',
  locator: slide(2),
  concepts: [],
  faces: [],
  createdBy: 'ai',
  createdAt: now,
  updatedAt: now,
  duplicateOf: { id: 'card_01J9Z3K4M2Q8R5T7V9X1Y3Z5JB', text: 'What does 2PC guarantee?' },
  advice: ['Keep the answer short: one fact per card.'],
};
const draftQuestion = {
  ...question(
    QUESTION,
    'Can two-phase commit block?',
    { kind: 'true_false', value: true },
    {
      status: 'draft',
      createdBy: 'ai',
      locator: slide(3),
    },
  ),
  duplicateOf: null,
};

const evidence = [
  {
    quote: 'Two-phase commit is an atomic commitment protocol.',
    title: 'Consensus',
    label: 'Slide 1',
    locator: slide(1),
  },
];
const proposals = [
  {
    id: CONCEPT_PROPOSAL,
    kind: 'concept',
    status: 'pending',
    payload: {
      kind: 'concept',
      name: 'Paxos protocol',
      aliases: [],
      summary: 'Agreement through numbered ballots.',
      moduleIds: [],
      similarTo: { id: PAXOS, name: 'Paxos', score: 0.9 },
    },
    evidence,
    origin: 'Concepts from Consensus',
    createdAt: now,
    decidedAt: null,
    result: null,
  },
  {
    id: RELATION_PROPOSAL,
    kind: 'relation',
    status: 'pending',
    payload: {
      kind: 'relation',
      from: { conceptId: null, proposalId: CONCEPT_PROPOSAL, name: 'Paxos protocol' },
      to: { conceptId: PAXOS, proposalId: null, name: 'Paxos' },
      relation: 'prerequisite_for',
      confidence: 'INFERRED',
      score: 0.75,
    },
    evidence,
    origin: 'Concepts from Consensus',
    createdAt: now,
    decidedAt: null,
    result: null,
  },
];

const estimate = {
  passages: 3,
  materialTokens: 400,
  truncated: false,
  inputTokens: 1600,
  outputTokens: 900,
  cost: 0.0185,
  model: 'Anthropic · claude-sonnet-5-5',
  problem: null,
};
const job = (status: string, extra: Record<string, unknown> = {}) => ({
  id: JOB,
  kind: 'ai.generate',
  subject: LECTURE,
  status,
  progress: status === 'succeeded' ? 1 : 0,
  message: null,
  error: null,
  attempts: 0,
  createdAt: now,
  updatedAt: now,
  ...extra,
});

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

function fakeServer(options: { drafts?: boolean; proposals?: boolean } = {}) {
  const calls: Call[] = [];
  const fetch: FakeFetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, path: url.pathname, body });
    const path = url.pathname;
    if (path === '/api/health') return json(HEALTH);
    if (path === '/api/inbox/counts')
      return json({
        drafts: options.drafts === false ? 0 : 2,
        proposals: options.proposals === false ? 0 : proposals.length,
      });
    if (path === '/api/drafts')
      return json(
        options.drafts === false
          ? { cards: [], questions: [] }
          : { cards: [draftCard], questions: [draftQuestion] },
      );
    if (path === '/api/drafts/accept' || path === '/api/drafts/reject')
      return json({ cards: body?.cardIds?.length ?? 0, questions: body?.questionIds?.length ?? 0 });
    if (path === '/api/proposals' && method === 'GET')
      return json({ proposals: options.proposals === false ? [] : proposals });
    if (path === `/api/proposals/${CONCEPT_PROPOSAL}/accept`)
      return json({
        ...proposals[0],
        status: 'accepted',
        decidedAt: now,
        result: { kind: 'concept', id: PAXOS },
      });
    if (path === `/api/proposals/${RELATION_PROPOSAL}/reject`)
      return json({ ...proposals[1], status: 'rejected', decidedAt: now });
    if (path === '/api/ai/status')
      return json({
        enabled: true,
        mock: false,
        roles: {},
        month: {
          requests: 0,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          budget: null,
          warning: false,
          exhausted: false,
        },
      });
    if (path === '/api/ai/generate/estimate') return json(estimate);
    if (path === '/api/ai/generate') return json(job('queued'), 201);
    if (path === '/api/card-sets') return json({ sets: [] });
    if (path === `/api/lectures/${LECTURE}`)
      return json({
        id: LECTURE,
        moduleId: MODULE,
        key: 'L3',
        title: 'Consensus',
        kind: 'lecture',
        week: 3,
        heldOn: null,
        ordinal: 0,
        sourceCount: 0,
        noteCount: 0,
        module: { id: MODULE, code: 'COC251', title: 'Distributed Systems' },
        sources: [],
        notes: [],
        concepts: [],
      });
    if (path === '/api/concepts') return json({ concepts: [] });
    if (path === '/api/notes/tree')
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
    return notFound();
  };
  return {
    fetch,
    find: (method: string, path: string) =>
      calls.filter((call) => call.method === method && call.path === path),
  };
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => {
  resetUiState();
  useGenerationJobs.setState({ jobs: {} });
});

describe('the Inbox', () => {
  it('lists drafts with their source, advice and duplicates, and accepts a batch', async () => {
    const user = userEvent.setup();
    const server = fakeServer({ proposals: false });
    renderApp('/inbox', server.fetch);
    expect(await screen.findByRole('heading', { level: 1, name: 'Inbox' })).toBeInTheDocument();
    expect(await screen.findByText('What does two-phase commit guarantee?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Slide 2' })).toHaveAttribute(
      'href',
      `/library/${SOURCE}?slide=2`,
    );
    expect(screen.getByText(/Like one you have: “What does 2PC guarantee\?”/u)).toBeInTheDocument();
    expect(screen.getByText('Keep the answer short: one fact per card.')).toBeInTheDocument();
    expect(screen.getByText('Can two-phase commit block?')).toBeInTheDocument();
    // The sidebar counts what waits.
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(await within(nav).findByText('2')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Accept selected' }));
    await waitFor(() => expect(server.find('POST', '/api/drafts/accept')).toHaveLength(1));
    expect(server.find('POST', '/api/drafts/accept')[0]?.body).toEqual({
      cardIds: [CARD],
      questionIds: [QUESTION],
    });

    await user.click(screen.getByRole('button', { name: /Reject question/u }));
    await waitFor(() =>
      expect(server.find('POST', '/api/drafts/reject')[0]?.body).toEqual({
        cardIds: [],
        questionIds: [QUESTION],
      }),
    );
  });

  it('shows suggestions with their evidence, merges a near-duplicate and rejects a relation', async () => {
    const user = userEvent.setup();
    const server = fakeServer({ drafts: false });
    renderApp('/inbox', server.fetch);
    // With no drafts, the Inbox opens on the suggestions.
    expect(await screen.findByText('Agreement through numbered ballots.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Suggestions/u })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText(/Perhaps the same as “Paxos” \(90 % alike\)/u)).toBeInTheDocument();
    expect(screen.getAllByText(/Two-phase commit is an atomic commitment protocol/u)).toHaveLength(
      2,
    );
    expect(screen.getByText('is a prerequisite for')).toBeInTheDocument();
    expect(screen.getByText('Inferred · 75 %')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Merge into it/u }));
    await waitFor(() =>
      expect(server.find('POST', `/api/proposals/${CONCEPT_PROPOSAL}/accept`)[0]?.body).toEqual({
        mergeInto: PAXOS,
      }),
    );
    const relation = screen.getByText('is a prerequisite for').closest('li') as HTMLElement;
    await user.click(within(relation).getByRole('button', { name: /Reject/u }));
    await waitFor(() =>
      expect(server.find('POST', `/api/proposals/${RELATION_PROPOSAL}/reject`)).toHaveLength(1),
    );
  });
});

describe('generating', () => {
  it('estimates before generating, then follows the job to the Inbox', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderApp(`/lectures/${LECTURE}`, server.fetch);
    await user.click(await screen.findByRole('button', { name: /Generate…/u }));
    const dialog = await screen.findByRole('dialog', { name: 'Generate with AI' });
    expect(await within(dialog).findByText(/3 passages · about 2,500 tokens/u)).toBeInTheDocument();
    expect(within(dialog).getByText(/about \$0\.02/u)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Questions' }));
    await user.click(within(dialog).getByRole('button', { name: /Generate$/u }));
    await waitFor(() => expect(server.find('POST', '/api/ai/generate')).toHaveLength(1));
    expect(server.find('POST', '/api/ai/generate')[0]?.body).toMatchObject({
      task: 'questions',
      scope: { kind: 'lecture', lectureId: LECTURE },
      count: 10,
      questionKinds: ['mcq', 'short', 'explain'],
    });
    expect(await within(dialog).findByRole('progressbar')).toBeInTheDocument();

    dispatchServerEvent({
      type: 'job.updated',
      job: job('succeeded', { message: '8 questions ready to review in the Inbox.' }),
    } as never);
    expect(
      await within(dialog).findByText('8 questions ready to review in the Inbox.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open Inbox' })).toHaveAttribute(
      'href',
      '/inbox',
    );
  });
});
