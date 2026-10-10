import { DEFAULT_REVIEW_SETTINGS } from '@skb/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';

const SET = 'set_01J9Z3K4M2Q8R5T7V9X1Y3Z5G1';
const CARD_A = 'card_01J9Z3K4M2Q8R5T7V9X1Y3Z5G2';
const CARD_B = 'card_01J9Z3K4M2Q8R5T7V9X1Y3Z5G3';
const SESSION = 'ses_01J9Z3K4M2Q8R5T7V9X1Y3Z5G4';
const now = '2026-10-09T10:00:00.000Z';

const counts = { cards: 2, new: 1, due: 1, suspended: 0 };
const set = {
  id: SET,
  title: 'Consensus',
  description: '',
  module: null,
  lecture: null,
  origin: 'manual',
  counts,
  createdAt: now,
  updatedAt: now,
};
const face = (state: string) => ({
  ordinal: 0,
  state,
  due: now,
  reps: 0,
  lapses: 0,
  buriedUntil: null,
});
const card = (id: string, front: string, state = 'new') => ({
  id,
  setId: SET,
  kind: 'basic',
  front,
  back: `${front} answer`,
  extra: '',
  status: 'active',
  locator: null,
  concepts: [],
  faces: [face(state)],
  createdBy: 'user',
  createdAt: now,
  updatedAt: now,
});
const item = (cardId: string, front: string, state: string) => ({
  cardId,
  ordinal: 0,
  setId: SET,
  setTitle: 'Consensus',
  kind: 'basic',
  front,
  back: `${front} answer`,
  locator: null,
  concepts: [],
  state,
  due: now,
  intervals: [
    { rating: 1, due: now, label: '1 min' },
    { rating: 2, due: now, label: '6 min' },
    { rating: 3, due: now, label: '10 min' },
    { rating: 4, due: now, label: '4 d' },
  ],
  retrievability: state === 'review' ? 0.8 : null,
});
const summary = (reviews: number, endedAt: string | null = null) => ({
  id: SESSION,
  startedAt: now,
  endedAt,
  reviews,
  newFaces: reviews > 0 ? 1 : 0,
  again: 0,
  trueRetention: reviews > 1 ? 1 : null,
  lapses: 0,
  durationMs: reviews * 5_000,
  concepts: [],
});
const stats = {
  dueToday: 1,
  forecast: Array.from({ length: 30 }, (_, i) => ({
    date: `2026-10-${String(9 + (i % 20)).padStart(2, '0')}`,
    count: i === 0 ? 1 : 0,
  })),
  history: Array.from({ length: 30 }, (_, i) => ({
    date: `2026-09-${String(10 + (i % 20)).padStart(2, '0')}`,
    reviews: i === 29 ? 3 : 0,
    again: 0,
  })),
  trueRetention: 0.9,
  cards: 2,
  faces: 2,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeServer(options: { empty?: boolean } = {}) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  let queueCalls = 0;
  let reviews = 0;
  const fetch: FakeFetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, path: url.pathname, body });
    const path = url.pathname;
    if (path === '/api/health') return json(HEALTH);
    if (path === '/api/card-sets' && method === 'GET')
      return json({ sets: options.empty ? [] : [set] });
    if (path === `/api/card-sets/${SET}`)
      return json({
        ...set,
        cards: [
          card(CARD_A, 'Who proposed Paxos?', 'review'),
          card(CARD_B, 'What does Raft elect?'),
        ],
      });
    if (path === '/api/review/stats') return json(stats);
    if (path === '/api/settings/review') return json(DEFAULT_REVIEW_SETTINGS);
    if (path === '/api/review-sessions' && method === 'POST') return json(summary(0), 201);
    if (path === `/api/review-sessions/${SESSION}/end`) return json(summary(reviews, now));
    if (path === '/api/review/queue') {
      queueCalls += 1;
      return json(
        queueCalls === 1
          ? {
              items: [
                item(CARD_A, 'Who proposed Paxos?', 'review'),
                item(CARD_B, 'What does Raft elect?', 'new'),
              ],
              counts: { new: 1, learning: 0, review: 1 },
              nextDue: null,
            }
          : { items: [], counts: { new: 0, learning: 0, review: 0 }, nextDue: null },
      );
    }
    if (path === '/api/reviews' && method === 'POST') {
      reviews += 1;
      return json({ logId: `rev_${reviews}`, face: face('learning') }, 201);
    }
    if (path === '/api/reviews/undo') {
      reviews -= 1;
      return json({ item: item(CARD_B, 'What does Raft elect?', 'new') });
    }
    if (path === '/api/cards/bulk') return json({ changed: body.ids.length });
    if (path === '/api/cards' && method === 'POST')
      return json(card('card_01J9Z3K4M2Q8R5T7V9X1Y3Z5G9', body.front), 201);
    if (path === '/api/concepts') return json({ concepts: [] });
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
    if (path === '/api/modules') return json({ modules: [] });
    if (path === '/api/courses') return json({ courses: [] });
    if (path === '/api/deadlines') return json({ deadlines: [] });
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

describe('the review page', () => {
  it('shows what is due, the sets and the statistics', async () => {
    renderApp('/review', fakeServer().fetch);
    expect(await screen.findByRole('heading', { level: 1, name: 'Review' })).toBeInTheDocument();
    const sets = await screen.findByRole('list', { name: 'Card sets' });
    expect(within(sets).getByRole('link', { name: 'Consensus' })).toHaveAttribute(
      'href',
      `/review/sets/${SET}`,
    );
    expect(within(sets).getByText('1 due')).toBeInTheDocument();
    expect(within(sets).getByRole('link', { name: 'Review Consensus' })).toHaveAttribute(
      'href',
      `/review/session?set=${SET}`,
    );
    expect(screen.getByText('90 %')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Due in the next 30 days' }).children).toHaveLength(30);
  });

  it('invites the first card when there are none', async () => {
    renderApp('/review', fakeServer({ empty: true }).fetch);
    expect(await screen.findByRole('heading', { name: 'No flashcards yet' })).toBeInTheDocument();
  });
});

describe('a review session', () => {
  it('reveals, rates by keyboard, undoes and ends with a summary', async () => {
    const server = fakeServer();
    renderApp('/review/session', server.fetch);
    const question = await screen.findByRole('region', { name: 'Question' });
    expect(within(question).getByText('Who proposed Paxos?')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.keyboard(' ');
    expect(await screen.findByRole('region', { name: 'Answer' })).toHaveTextContent(
      'Who proposed Paxos? answer',
    );
    expect(screen.getByRole('button', { name: /Good.*10 min/ })).toBeInTheDocument();
    await user.keyboard('3');
    await waitFor(() =>
      expect(server.calls.find((call) => call.path === '/api/reviews')?.body).toMatchObject({
        cardId: CARD_A,
        ordinal: 0,
        rating: 3,
        sessionId: SESSION,
      }),
    );
    expect(await screen.findByText('What does Raft elect?')).toBeInTheDocument();
    // Ratings need the answer first.
    await user.keyboard('4');
    expect(server.calls.filter((call) => call.path === '/api/reviews')).toHaveLength(1);
    await user.keyboard(' ');
    await user.click(screen.getByRole('button', { name: /Easy/ }));
    expect(await screen.findByRole('heading', { name: 'Session complete' })).toBeInTheDocument();
    expect(screen.getByText('2 reviews in under a minute.')).toBeInTheDocument();

    // Undo from the summary brings the last face back.
    await user.keyboard('{Control>}z{/Control}');
    expect(await screen.findByRole('region', { name: 'Question' })).toHaveTextContent(
      'What does Raft elect?',
    );
    expect(server.calls.some((call) => call.path === '/api/reviews/undo')).toBe(true);
  });
});

describe('writing cards', () => {
  it('wraps the selection in a cloze, shows hints and saves', async () => {
    const server = fakeServer();
    renderApp(`/review/sets/${SET}`, server.fetch);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New card' }));
    const dialog = await screen.findByRole('dialog', { name: 'New card' });
    const front = within(dialog).getByLabelText('Front');
    await user.type(front, 'Raft elects a leader');
    (front as HTMLTextAreaElement).setSelectionRange(14, 20);
    await user.click(within(dialog).getByRole('button', { name: 'Cloze' }));
    expect(within(dialog).getByLabelText('Text')).toHaveValue('Raft elects a {{c1::leader}}');
    expect(within(dialog).getByRole('radio', { name: 'Cloze' })).toBeChecked();
    expect(within(dialog).getByRole('region', { name: 'Preview' })).toHaveTextContent(
      'Raft elects a […]',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Add card' }));
    await waitFor(() =>
      expect(server.calls.find((call) => call.path === '/api/cards')?.body).toMatchObject({
        setId: SET,
        kind: 'cloze',
        front: 'Raft elects a {{c1::leader}}',
        status: 'active',
      }),
    );
  });

  it('suspends selected cards together', async () => {
    const server = fakeServer();
    renderApp(`/review/sets/${SET}`, server.fetch);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Select all cards' }));
    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    await waitFor(() =>
      expect(server.calls.find((call) => call.path === '/api/cards/bulk')?.body).toEqual({
        ids: [CARD_A, CARD_B],
        action: 'suspend',
      }),
    );
  });

  it('asks before deleting selected cards', async () => {
    const server = fakeServer();
    renderApp(`/review/sets/${SET}`, server.fetch);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: 'Select all cards' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete 2 cards?' });
    expect(server.calls.some((call) => call.path === '/api/cards/bulk')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Delete cards' }));
    await waitFor(() =>
      expect(server.calls.find((call) => call.path === '/api/cards/bulk')?.body).toEqual({
        ids: [CARD_A, CARD_B],
        action: 'delete',
      }),
    );
    expect(await screen.findByText('2 cards deleted')).toBeInTheDocument();
  });
});

describe('today', () => {
  it('shows the reviews due and an estimate', async () => {
    renderApp('/', fakeServer().fetch);
    const start = await screen.findByRole('link', { name: 'Review now' });
    expect(start).toHaveAttribute('href', '/review/session');
    expect(screen.getByText(/1 new card/)).toBeInTheDocument();
  });
});
