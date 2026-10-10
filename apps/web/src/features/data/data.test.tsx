import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { json, notFound } from '../../test/practice-fixtures';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';

const NOW = '2026-10-09T10:00:00.000Z';
const CONCEPT = 'con_01J9Z3K4M2Q8R5T7V9X1Y3Z5D1';
const GRAPH = 'cgr_01J9Z3K4M2Q8R5T7V9X1Y3Z5D2';
const ENTITY_A = 'cod_01J9Z3K4M2Q8R5T7V9X1Y3Z5D3';
const ENTITY_B = 'cod_01J9Z3K4M2Q8R5T7V9X1Y3Z5D4';
const JOB = 'job_01J9Z3K4M2Q8R5T7V9X1Y3Z5D5';

const overview = (extra: Record<string, unknown> = {}) => ({
  vault: { id: HEALTH.vault.id, name: 'Study Vault', path: 'C:/Users/will/Documents/Study Vault' },
  counts: { notes: 12, sources: 3, concepts: 8, cards: 40, questions: 20, answers: 55 },
  exports: [
    {
      name: 'manuscript-export-2026-10-08-09-00-00.zip',
      sizeBytes: 4_300_000,
      createdAt: '2026-10-08T09:00:00.000Z',
    },
  ],
  exportsFolder: 'C:/Users/will/AppData/Roaming/Manuscript/exports',
  recentVaults: [
    {
      path: 'C:/Users/will/Documents/Study Vault',
      name: 'Study Vault',
      lastOpenedAt: NOW,
      current: true,
      exists: true,
    },
    {
      path: 'C:/Users/will/Documents/Obsidian/Uni',
      name: 'Uni',
      lastOpenedAt: '2026-10-01T10:00:00.000Z',
      current: false,
      exists: true,
    },
  ],
  job: null,
  canRestart: true,
  ...extra,
});

const entity = (id: string, label: string) => ({
  id,
  graphId: GRAPH,
  graphName: 'raft-lab',
  label,
  kind: 'code',
  file: 'src/raft.py',
  location: 'L12',
  rationale: null,
});

const graph = {
  id: GRAPH,
  name: 'raft-lab',
  fileName: 'raft-lab.json',
  module: null,
  entities: 7,
  edges: 5,
  links: { proposed: 1, accepted: 1 },
  importedAt: NOW,
};

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function fakeServer() {
  const calls: Call[] = [];
  const fetch: FakeFetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const path = url.pathname;
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : (init?.body ?? null);
    calls.push({ method, path, body });
    if (path === '/api/health') return json(HEALTH);
    if (path === '/api/data') return json(overview());
    if (path === '/api/backups' && method === 'GET')
      return json({
        backups: [
          {
            name: 'skb-20261010-080000-daily.db',
            reason: 'daily',
            sizeBytes: 2_500_000,
            createdAt: '2026-10-10T08:00:00.000Z',
          },
          {
            name: 'skb-20261009-090000-migration-0016_code_graphs.db',
            reason: 'migration',
            sizeBytes: 2_400_000,
            createdAt: '2026-10-09T09:00:00.000Z',
          },
        ],
        folder: 'C:/Vault/.skb/backups',
        keep: { daily: 14, migration: 5, manual: 10 },
      });
    if (path === '/api/backups' && method === 'POST')
      return json(
        {
          name: 'skb-20261010-100000-manual.db',
          reason: 'manual',
          sizeBytes: 2_600_000,
          createdAt: NOW,
        },
        201,
      );
    const job = {
      id: JOB,
      kind: 'data.export',
      subject: 'data',
      status: 'queued',
      progress: 0,
      message: null,
      error: null,
      attempts: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    if (path === '/api/data/export') return json({ job }, 201);
    if (path === '/api/data/restore') return json({ job: { ...job, kind: 'data.restore' } }, 201);
    if (path === '/api/data/rescan') return json({ job: { ...job, kind: 'data.rescan' } }, 201);
    if (path === '/api/data/vaults/inspect')
      return json({
        path: (body as { path: string }).path,
        kind: 'obsidian',
        notes: 41,
        files: 6,
        obsidian: true,
        current: false,
        locked: false,
        summary: 'An Obsidian vault with 41 notes. Manuscript reads the notes where they are.',
      });
    if (path === '/api/data/vaults/switch')
      return json({ restarting: false, path: (body as { path: string }).path });
    if (path === '/api/data/concepts/materialise')
      return json(
        {
          folder: 'Concepts',
          created: [{ conceptId: CONCEPT, name: 'Raft', path: 'Concepts/Raft.md' }],
          skipped: 2,
        },
        201,
      );
    if (path === '/api/code/graphs' && method === 'GET') return json({ graphs: [graph] });
    if (path === '/api/code/graphs' && method === 'POST')
      return json(
        { graph: { ...graph, name: 'new-graph' }, duplicate: false, droppedEdges: 0 },
        201,
      );
    if (path === `/api/concepts/${CONCEPT}/code` && method === 'GET')
      return json({
        links: [
          {
            entity: entity(ENTITY_A, 'RaftNode'),
            status: 'accepted',
            score: 0.9,
            reason: 'Chosen by you.',
            createdBy: 'user',
          },
          {
            entity: entity(ENTITY_B, 'elect_leader()'),
            status: 'proposed',
            score: 0.6,
            reason: 'The name “elect_leader()” contains “leader”.',
            createdBy: 'system',
          },
        ],
      });
    if (path === `/api/concepts/${CONCEPT}/code/${ENTITY_B}` && method === 'PUT')
      return json({
        entity: entity(ENTITY_B, 'elect_leader()'),
        status: (body as { status: string }).status,
        score: 0.6,
        reason: '',
        createdBy: 'system',
      });
    if (path === `/api/concepts/${CONCEPT}` && method === 'GET')
      return json({
        id: CONCEPT,
        name: 'Raft',
        slug: 'raft',
        aliases: [],
        summary: '',
        importance: 1,
        moduleIds: [],
        topicIds: [],
        noteId: null,
        mentionCount: 0,
        createdAt: NOW,
        updatedAt: NOW,
        modules: [],
        topics: [],
        note: null,
        mentions: [],
        passages: [],
      });
    return notFound();
  };
  return {
    fetch,
    find: (method: string, path: string) =>
      calls.filter((call) => call.method === method && call.path === path),
  };
}

beforeEach(() => resetUiState());

describe('Settings → Data', () => {
  it('exports everything, lists what was exported, and says where it is kept', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderApp('/settings', server.fetch);
    const exports = await screen.findByRole('list', { name: 'Exports' });
    expect(
      within(exports).getByText('manuscript-export-2026-10-08-09-00-00.zip'),
    ).toBeInTheDocument();
    expect(within(exports).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      '/api/data/exports/manuscript-export-2026-10-08-09-00-00.zip/download',
    );
    expect(
      screen.getByText('C:/Users/will/AppData/Roaming/Manuscript/exports'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Export everything' }));
    await waitFor(() => expect(server.find('POST', '/api/data/export')).toHaveLength(1));
  });

  it('says what opening another folder will do before it does it, and what happens next', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderApp('/settings', server.fetch);
    const form = await screen.findByRole('form', { name: 'Open a folder' });
    await user.type(
      within(form).getByLabelText('Open another folder as a vault'),
      'C:/Users/will/Documents/Obsidian/Uni',
    );
    await user.click(within(form).getByRole('button', { name: 'Look at it' }));
    expect(await screen.findByText(/An Obsidian vault with 41 notes/u)).toBeInTheDocument();
    // Nothing was switched by looking.
    expect(server.find('POST', '/api/data/vaults/switch')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Open this vault' }));
    await waitFor(() => expect(server.find('POST', '/api/data/vaults/switch')).toHaveLength(1));
    expect(
      await screen.findByText(/will open the next time you start Manuscript/u),
    ).toBeInTheDocument();
  });

  it('restores an export into a new folder', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderApp('/settings', server.fetch);
    const form = await screen.findByRole('form', { name: 'Restore from an export' });
    const restore = within(form).getByRole('button', { name: 'Restore into a new vault' });
    expect(restore).toBeDisabled();
    await user.type(
      within(form).getByLabelText('Export'),
      'manuscript-export-2026-10-08-09-00-00.zip',
    );
    await user.type(within(form).getByLabelText('New vault folder'), 'D:/Restored');
    await user.click(restore);
    await waitFor(() => expect(server.find('POST', '/api/data/restore')).toHaveLength(1));
    expect(server.find('POST', '/api/data/restore')[0]?.body).toEqual({
      archive: 'manuscript-export-2026-10-08-09-00-00.zip',
      target: 'D:/Restored',
    });
  });

  it('lists the database backups and makes one on request', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderApp('/settings', server.fetch);
    const list = await screen.findByRole('list', { name: 'Backups' });
    expect(within(list).getByText('skb-20261010-080000-daily.db')).toBeInTheDocument();
    expect(within(list).getByText('before an update')).toBeInTheDocument();
    expect(screen.getByText('C:/Vault/.skb/backups')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back up now' }));
    await waitFor(() => expect(server.find('POST', '/api/backups')).toHaveLength(1));
  });

  it('writes notes for concepts and reports what it did', async () => {
    const user = userEvent.setup();
    renderApp('/settings', fakeServer().fetch);
    await user.click(await screen.findByRole('button', { name: 'Write notes for my concepts' }));
    expect(
      await screen.findByText('1 note written in Concepts; 2 already had one.'),
    ).toBeInTheDocument();
  });

  it('lists imported code graphs and imports another', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderApp('/settings', server.fetch);
    const graphs = await screen.findByRole('list', { name: 'Imported graphs' });
    expect(within(graphs).getByText('raft-lab')).toBeInTheDocument();
    expect(within(graphs).getByText('1 suggested')).toBeInTheDocument();

    const form = screen.getByRole('form', { name: 'Import a graph' });
    const file = new File(['{"nodes":[]}'], 'graph.json', { type: 'application/json' });
    await user.upload(within(form).getByLabelText('graph.json'), file);
    await user.click(within(form).getByRole('button', { name: 'Import' }));
    expect(await screen.findByText(/Imported “new-graph”/u)).toBeInTheDocument();
  });
});

describe('a concept and its code', () => {
  it('shows where it is implemented and lets the student decide on a suggestion', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderApp(`/concepts/${CONCEPT}`, server.fetch);
    const linked = await screen.findByRole('list', { name: 'Linked code' });
    expect(within(linked).getByText('RaftNode')).toBeInTheDocument();
    const suggested = screen.getByRole('list', { name: 'Suggested code' });
    expect(
      within(suggested).getByText(/The name “elect_leader\(\)” contains “leader”/u),
    ).toBeInTheDocument();
    await user.click(within(suggested).getByRole('button', { name: 'Accept elect_leader()' }));
    await waitFor(() =>
      expect(server.find('PUT', `/api/concepts/${CONCEPT}/code/${ENTITY_B}`)).toHaveLength(1),
    );
    expect(server.find('PUT', `/api/concepts/${CONCEPT}/code/${ENTITY_B}`)[0]?.body).toEqual({
      status: 'accepted',
    });
  });
});
