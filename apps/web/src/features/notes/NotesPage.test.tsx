import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';
import { useNotesUi } from './notes-store';

const PAXOS = 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7';
const RAFT = 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A8';

const TREE = {
  notes: [
    {
      id: PAXOS,
      path: 'Modules/Paxos.md',
      title: 'Paxos',
      type: null,
      aliases: [],
      updatedAt: '2026-10-07T12:00:00.000Z',
      createdAt: '2026-10-01T12:00:00.000Z',
    },
    {
      id: RAFT,
      path: 'Raft.md',
      title: 'Raft',
      type: null,
      aliases: ['Raft consensus'],
      updatedAt: '2026-10-07T12:00:00.000Z',
      createdAt: '2026-10-01T12:00:00.000Z',
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

function note(id: string, path: string, title: string, content: string) {
  return {
    id,
    path,
    title,
    type: null,
    aliases: [],
    updatedAt: '2026-10-07T12:00:00.000Z',
    content,
    hash: `hash-${id}`,
    frontmatter: {},
    module: null,
    lecture: null,
    tags: [],
    createdAt: '2026-10-07T12:00:00.000Z',
    wordCount: 4,
    sizeBytes: content.length,
    idPersisted: false,
    headings: [],
    links: [],
    warnings: [],
  };
}

const NOTES: Record<string, ReturnType<typeof note>> = {
  [PAXOS]: note(PAXOS, 'Modules/Paxos.md', 'Paxos', '# Paxos\n## Safety\nCompare with [[Raft]].'),
  [RAFT]: note(RAFT, 'Raft.md', 'Raft', '# Raft\nLeader election.'),
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const OVERVIEW = {
  vault: { id: 'vault_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7', name: 'Uni', path: 'C:/Users/me/Documents/Uni' },
  counts: { notes: 2, sources: 0, concepts: 0, cards: 0, questions: 0, answers: 0 },
  exports: [],
  exportsFolder: 'C:/data/exports',
  recentVaults: [],
  job: null,
  canRestart: false,
};

const problem = {
  type: 'urn:skb:problem:not_found',
  title: 'Not found',
  status: 404,
  code: 'not_found',
};

function fetchWith(tree: typeof TREE): FakeFetch {
  return async (input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/health') return json(HEALTH);
    if (url.pathname === '/api/notes') return json(tree);
    if (url.pathname === '/api/data') return json(OVERVIEW);
    if (url.pathname === '/api/bookmarks') return json({ items: [] });
    const match = /^\/api\/notes\/([^/]+)(\/backlinks)?$/.exec(url.pathname);
    if (match?.[2]) return json({ linked: [] });
    if (match?.[1] && NOTES[match[1]]) return json(NOTES[match[1]]);
    return json(problem, 404);
  };
}

const notesFetch = fetchWith(TREE);
/** The tabs of a pane, by the names on them. */
const tabNames = (pane = 'Open notes') =>
  within(screen.getByRole('navigation', { name: pane }))
    .getAllByRole('button')
    .filter((button) => {
      const label = button.getAttribute('aria-label') ?? '';
      return !label.startsWith('Close ') && label !== 'New tab';
    })
    .map((tab) => tab.textContent);

beforeEach(() => {
  resetUiState();
  useNotesUi.setState({
    expanded: new Set(),
    mode: 'edit',
    panel: 'outline',
    justCreated: null,
    detailsOpen: false,
    sort: 'name-asc',
  });
});

describe('Notes page', () => {
  it('shows the file tree, the open vault and an empty tab', async () => {
    renderApp('/notes', notesFetch);
    expect(await screen.findByRole('heading', { level: 1, name: 'Notes' })).toBeInTheDocument();
    const tree = await screen.findByRole('tree', { name: 'Notes and folders' });
    expect(
      within(tree)
        .getAllByRole('treeitem')
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual(['Modules', 'Raft']);
    expect(screen.getByRole('heading', { name: 'No note is open' })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Vault: Uni. Change vault' }),
    ).toBeInTheDocument();
    // The Details panel starts closed.
    expect(screen.getByRole('button', { name: 'Show details' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // Panes keep their headers outside their scroll areas.
    for (const pane of document.querySelectorAll('[data-pane]')) {
      expect(
        pane.querySelector('[data-pane-body]')?.contains(pane.querySelector('[data-pane-header]')),
      ).toBe(false);
    }
  });

  it('opens a note from the tree into its tab, with its outline in the Details panel', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/notes', notesFetch);
    await user.click(await screen.findByRole('treeitem', { name: 'Raft' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/notes/${RAFT}`));
    expect(await screen.findByRole('heading', { level: 1, name: 'Raft' })).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('.cm-content')?.textContent).toContain('Leader election.'),
    );
    expect(screen.getByRole('treeitem', { name: 'Raft' })).toHaveAttribute('aria-selected', 'true');
    expect(tabNames()).toEqual(['Raft']);
    expect(screen.getByText('Saved')).toBeInTheDocument();

    expect(screen.queryByRole('navigation', { name: 'Outline' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show details' }));
    expect(await screen.findByRole('navigation', { name: 'Outline' })).toHaveTextContent('Raft');
  });

  it('opens a note in a new tab with Ctrl+click, and closing it goes back to the other', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`/notes/${RAFT}`, notesFetch);
    await user.click(await screen.findByRole('treeitem', { name: 'Modules' }));
    await user.keyboard('{Control>}');
    await user.click(await screen.findByRole('treeitem', { name: 'Paxos' }));
    await user.keyboard('{/Control}');
    await waitFor(() => expect(router.state.location.pathname).toBe(`/notes/${PAXOS}`));
    expect(tabNames()).toEqual(['Raft', 'Paxos']);
    await user.click(screen.getByRole('button', { name: 'Close Paxos' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/notes/${RAFT}`));
    expect(tabNames()).toEqual(['Raft']);
    // The last tab leaves an empty one, and the address follows.
    await user.click(screen.getByRole('button', { name: 'Close Raft' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/notes'));
    expect(tabNames()).toEqual(['New tab']);
  });

  it('has the More options menu of Obsidian, whose Split right opens a second pane', async () => {
    const user = userEvent.setup();
    renderApp(`/notes/${RAFT}`, notesFetch);
    await user.click(await screen.findByRole('button', { name: 'More options' }));
    const menu = await screen.findByRole('menu');
    const items = [
      ...within(menu).queryAllByRole('menuitem'),
      ...within(menu).queryAllByRole('menuitemcheckbox'),
    ].map((item) => item.textContent ?? '');
    for (const expected of [
      'Backlinks in document',
      'Reading view',
      'Source mode',
      'Split right',
      'Split down',
      'Open in new window',
      'Rename…',
      'Move file to…',
      'Bookmark',
      'Merge entire file with…',
      'Add file property',
      'Export to PDF…',
      'Find…',
      'Replace…',
      'Copy path',
      'Open version history',
      'Open linked view',
      'Open in default app',
      'Show in system explorer',
      'Reveal file in navigation',
      'Delete file',
    ])
      expect(
        items.some((item) => item.startsWith(expected)),
        expected,
      ).toBe(true);
    await user.click(within(menu).getByRole('menuitem', { name: 'Split right' }));
    expect(
      await screen.findByRole('navigation', { name: 'Open notes in the pane on the right' }),
    ).toBeInTheDocument();
    expect(tabNames('Open notes in the first pane')).toEqual(['Raft']);
    expect(tabNames('Open notes in the pane on the right')).toEqual(['Raft']);
  });

  it('expands every folder and collapses them again from one button', async () => {
    const user = userEvent.setup();
    renderApp('/notes', notesFetch);
    await user.click(await screen.findByRole('button', { name: 'Expand all' }));
    expect(await screen.findByRole('treeitem', { name: 'Paxos' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Collapse all' }));
    await waitFor(() =>
      expect(screen.queryByRole('treeitem', { name: 'Paxos' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Expand all' })).toBeInTheDocument();
  });

  it('changes the sort order to one of the six of Obsidian', async () => {
    const user = userEvent.setup();
    renderApp('/notes', notesFetch);
    await user.click(await screen.findByRole('button', { name: 'Change sort order' }));
    const orders = await screen.findAllByRole('menuitemradio');
    expect(orders.map((order) => order.textContent)).toEqual([
      'File name (A to Z)',
      'File name (Z to A)',
      'Modified time (new to old)',
      'Modified time (old to new)',
      'Created time (new to old)',
      'Created time (old to new)',
    ]);
    await user.click(screen.getByRole('menuitemradio', { name: 'Created time (new to old)' }));
    expect(useNotesUi.getState().sort).toBe('created-desc');
  });

  it('says when the vault is empty, and offers to write a note or open another vault', async () => {
    renderApp('/notes', fetchWith({ ...TREE, notes: [], folders: [] }));
    expect(await screen.findByText('No notes or folders yet.')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: '“Uni” has no notes yet' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Open another vault…' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Create a note' })).toBeInTheDocument();
  });

  it('opens a note just created ready to write in, and only once', async () => {
    useNotesUi.setState({ justCreated: RAFT });
    renderApp(`/notes/${RAFT}`, notesFetch);
    await waitFor(() => expect(document.activeElement?.closest('.cm-editor')).not.toBeNull());
    expect(useNotesUi.getState().justCreated).toBeNull();
  });

  it('reveals the open note in the tree and renders the preview with resolved links', async () => {
    useNotesUi.setState({ mode: 'preview' });
    renderApp(`/notes/${PAXOS}`, notesFetch);
    expect(await screen.findByRole('heading', { level: 1, name: 'Paxos' })).toBeInTheDocument();
    expect(await screen.findByRole('treeitem', { name: 'Paxos' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByRole('link', { name: 'Raft' }, { timeout: 4000 })).toHaveAttribute(
      'href',
      `/notes/${RAFT}`,
    );
  });

  it('explains when a note no longer exists', async () => {
    renderApp('/notes/note_01J9Z3K4M2Q8R5T7V9X1Y3Z5AZ', notesFetch);
    expect(
      await screen.findByRole('heading', { name: 'This note no longer exists' }),
    ).toBeInTheDocument();
  });
});
