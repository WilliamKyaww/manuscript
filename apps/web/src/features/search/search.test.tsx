import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';

const RAFT = 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A1';
const PAXOS = 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A2';
const now = '2026-10-08T12:00:00.000Z';

const TREE = {
  notes: [
    {
      id: RAFT,
      path: 'Modules/Raft.md',
      title: 'Raft',
      type: 'lecture-notes',
      aliases: ['Raft algorithm'],
      updatedAt: now,
      createdAt: now,
    },
    {
      id: PAXOS,
      path: 'Paxos.md',
      title: 'Paxos made simple',
      type: null,
      aliases: ['Synod'],
      updatedAt: now,
      createdAt: now,
    },
  ],
  folders: ['Modules'],
  attachments: [],
  index: {
    state: 'ready',
    notes: 2,
    attachments: 0,
    processed: 0,
    total: 0,
    lastScanAt: null,
    lastScanMs: null,
  },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeServer() {
  const searches: string[] = [];
  const recorded: string[] = [];
  const fetch: FakeFetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/health') return json(HEALTH);
    if (url.pathname === '/api/notes') return json(TREE);
    if (url.pathname === '/api/tags') return json({ tags: [{ tag: 'exam', count: 1 }] });
    if (url.pathname === '/api/recent' && init?.method === 'POST') {
      recorded.push(String(init.body));
      return json({ ok: true });
    }
    if (url.pathname === '/api/recent') {
      return json({
        items: [
          {
            kind: 'note',
            note: { id: PAXOS, path: 'Paxos.md', title: 'Paxos made simple' },
            openedAt: now,
          },
        ],
      });
    }
    if (url.pathname === '/api/search') {
      const q = url.searchParams.get('q') ?? '';
      searches.push(q);
      return json({
        query: q,
        total: 1,
        totalCapped: false,
        offset: 0,
        limit: 20,
        highlights: ['leader'],
        tookMs: 3,
        results: [
          {
            kind: 'note',
            note: {
              id: RAFT,
              path: 'Modules/Raft.md',
              title: 'Raft',
              type: 'lecture-notes',
              updatedAt: now,
            },
            title: [{ text: 'Raft', match: false }],
            snippet: [
              { text: 'The ', match: false },
              { text: 'leader', match: true },
              { text: ' sends heartbeats.', match: false },
            ],
            line: 12,
          },
        ],
      });
    }
    if (url.pathname.startsWith('/api/notes/'))
      return json({ type: 'x', title: 'Not found', status: 404, code: 'not_found' }, 404);
    return json({ type: 'x', title: 'Not found', status: 404, code: 'not_found' }, 404);
  };
  return { fetch, searches, recorded };
}

beforeEach(() => resetUiState());

describe('quick switcher', () => {
  it('opens with Ctrl+O, lists recent notes, and opens a note by part of its name', async () => {
    const user = userEvent.setup();
    const { fetch } = fakeServer();
    const { router } = renderApp('/', fetch);
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    await user.keyboard('{Control>}o{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Open a note' });
    expect(await within(dialog).findByText('Recently opened')).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: /Paxos made simple/ })).toBeInTheDocument();

    await user.type(within(dialog).getByRole('combobox'), 'synod');
    expect(
      await within(dialog).findByRole('option', { name: /Synod → Paxos made simple/ }),
    ).toBeInTheDocument();
    await user.clear(within(dialog).getByRole('combobox'));
    await user.type(within(dialog).getByRole('combobox'), 'raf');
    // The highlighted "Raf" and the rest are separate elements; the test DOM joins them with a space.
    const option = await within(dialog).findByRole('option', { name: /^Raf\s?t/ });
    expect(within(option).getByText('Raf', { selector: 'mark' })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe(`/notes/${RAFT}`));
  });

  it('offers to create a note when nothing matches exactly', async () => {
    const user = userEvent.setup();
    renderApp('/', fakeServer().fetch);
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    await user.keyboard('{Control>}o{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Open a note' });
    await user.type(within(dialog).getByRole('combobox'), 'Byzantine generals');
    expect(
      await within(dialog).findByRole('option', { name: /Create note “Byzantine generals”/ }),
    ).toBeInTheDocument();
    await user.clear(within(dialog).getByRole('combobox'));
    await user.type(within(dialog).getByRole('combobox'), 'raft');
    await within(dialog).findByRole('option', { name: /Raft/ });
    expect(within(dialog).queryByRole('option', { name: /Create note/ })).toBeNull();
  });
});

describe('search page', () => {
  it('shows highlighted results that open the note at the matching line', async () => {
    const { fetch, searches } = fakeServer();
    renderApp('/search?q=leader', fetch);
    expect(await screen.findByRole('heading', { level: 1, name: 'Search' })).toBeInTheDocument();
    const results = await screen.findByRole('list', { name: 'Search results' });
    const link = within(results).getByRole('link');
    expect(link).toHaveAttribute('href', `/notes/${RAFT}?line=12`);
    expect(within(link).getByText('leader', { selector: 'mark' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 result · 3 ms');
    expect(searches).toEqual(['leader']);
  });

  it('updates the address as you type and manages filters as chips', async () => {
    const user = userEvent.setup();
    const { fetch, searches } = fakeServer();
    const { router } = renderApp('/search', fetch);
    const input = await screen.findByRole('searchbox', { name: 'Search notes and sources' });
    expect(screen.getByRole('heading', { name: 'How to search' })).toBeInTheDocument();
    await user.type(input, 'leader');
    await waitFor(() => expect(router.state.location.search).toEqual({ q: 'leader' }));
    expect(input).toHaveValue('leader');

    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Add a tag filter' }),
      'exam',
    );
    await waitFor(() => expect(router.state.location.search).toEqual({ q: 'leader tag:exam' }));
    await user.click(screen.getByRole('button', { name: 'Remove the tag filter exam' }));
    await waitFor(() => expect(router.state.location.search).toEqual({ q: 'leader' }));
    expect(searches).toContain('leader tag:exam');
  });
});

describe('command palette', () => {
  it('offers matching notes and a full-text search', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/', fakeServer().fetch);
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    await user.keyboard('{Control>}k{/Control}');
    const palette = await screen.findByRole('dialog', { name: 'Command palette' });
    await user.type(within(palette).getByRole('combobox'), 'paxos');
    expect(
      await within(palette).findByRole('option', { name: 'Paxos made simple' }),
    ).toBeInTheDocument();
    await user.click(within(palette).getByRole('option', { name: 'Search for “paxos”' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/search'));
    expect(router.state.location.search).toEqual({ q: 'paxos' });
  });
});
