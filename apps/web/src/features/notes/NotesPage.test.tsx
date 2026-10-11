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
    },
    {
      id: RAFT,
      path: 'Raft.md',
      title: 'Raft',
      type: null,
      aliases: ['Raft consensus'],
      updatedAt: '2026-10-07T12:00:00.000Z',
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

const notesFetch: FakeFetch = async (input) => {
  const url = new URL(String(input), 'http://localhost');
  if (url.pathname === '/api/health') return json(HEALTH);
  if (url.pathname === '/api/notes') return json(TREE);
  const match = /^\/api\/notes\/([^/]+)(\/backlinks)?$/.exec(url.pathname);
  if (match?.[2]) return json({ linked: [] });
  if (match?.[1] && NOTES[match[1]]) return json(NOTES[match[1]]);
  return json(
    { type: 'urn:skb:problem:not_found', title: 'Not found', status: 404, code: 'not_found' },
    404,
  );
};

beforeEach(() => {
  resetUiState();
  useNotesUi.setState({ expanded: new Set(), mode: 'edit', panel: 'outline', justCreated: null });
});

describe('Notes page', () => {
  it('shows the file tree and invites you to open a note', async () => {
    renderApp('/notes', notesFetch);
    expect(await screen.findByRole('heading', { level: 1, name: 'Notes' })).toBeInTheDocument();
    const tree = await screen.findByRole('tree', { name: 'Notes and folders' });
    expect(
      within(tree)
        .getAllByRole('treeitem')
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual(['Modules', 'Raft']);
    expect(screen.getByRole('heading', { name: 'Open a note' })).toBeInTheDocument();
    // Panes keep their headers outside their scroll areas.
    for (const pane of document.querySelectorAll('[data-pane]')) {
      expect(
        pane.querySelector('[data-pane-body]')?.contains(pane.querySelector('[data-pane-header]')),
      ).toBe(false);
    }
  });

  it('opens a note from the tree into the editor, with its outline', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/notes', notesFetch);
    await user.click(await screen.findByRole('treeitem', { name: 'Raft' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/notes/${RAFT}`));
    expect(await screen.findByRole('heading', { level: 1, name: 'Raft' })).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('.cm-content')?.textContent).toContain('Leader election.'),
    );
    expect(screen.getByRole('treeitem', { name: 'Raft' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('navigation', { name: 'Outline' })).toHaveTextContent('Raft');
    expect(screen.getByText('Saved')).toBeInTheDocument();
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
