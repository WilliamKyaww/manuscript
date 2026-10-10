import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { json, notFound } from '../../test/practice-fixtures';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';

const REPORT = {
  app: {
    version: '0.1.0',
    mode: 'production',
    startedAt: '2026-10-10T08:00:00.000Z',
    uptimeSeconds: 3_700,
    node: '24.14.0',
    platform: 'win32 x64',
  },
  vault: { name: 'Manuscript', path: 'C:/Users/will/Documents/Manuscript' },
  database: {
    sqliteVersion: '3.51.2',
    migrations: 16,
    latestMigration: '0016_code_graphs',
    sizeBytes: 4_200_000,
    walBytes: 0,
  },
  counts: { notes: 120, sources: 14, concepts: 60, cards: 300, questions: 80 },
  jobs: {
    queued: 1,
    running: 0,
    failed: 1,
    recentFailures: [
      {
        kind: 'source.ingest',
        error: 'The PDF is encrypted.',
        updatedAt: '2026-10-10T09:00:00.000Z',
      },
    ],
  },
  backups: { count: 3, latestAt: '2026-10-10T08:01:00.000Z' },
  logs: { folder: 'C:/Vault/.skb/logs', files: [] },
};

const ENTRIES = [
  {
    time: '2026-10-10T09:30:00.000Z',
    level: 'error',
    message: 'Indexing the vault failed',
    fields: { path: 'Notes/a.md' },
  },
  { time: '2026-10-10T09:00:00.000Z', level: 'info', message: 'Manuscript is running', fields: {} },
];

function fakeServer() {
  const requests: URL[] = [];
  const fetch: FakeFetch = async (input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/health') return json(HEALTH);
    if (url.pathname === '/api/diagnostics') return json(REPORT);
    if (url.pathname === '/api/diagnostics/logs') {
      requests.push(url);
      const level = url.searchParams.get('level');
      return json({
        entries: level === 'error' ? ENTRIES.slice(0, 1) : ENTRIES,
        truncated: false,
      });
    }
    return notFound();
  };
  return { fetch, requests };
}

beforeEach(() => resetUiState());

describe('Diagnostics', () => {
  it('shows the state of the installation, its failed jobs and the log, filtered by level', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderApp('/diagnostics', server.fetch);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Diagnostics' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('0.1.0 (production)')).toBeInTheDocument();
    expect(screen.getByText(/16 migrations applied \(0016_code_graphs\)/u)).toBeInTheDocument();
    const failures = screen.getByRole('list', { name: 'Recent failures' });
    expect(within(failures).getByText('The PDF is encrypted.')).toBeInTheDocument();

    const entries = await screen.findByRole('list', { name: 'Log entries' });
    expect(within(entries).getByText('Indexing the vault failed')).toBeInTheDocument();
    expect(within(entries).getByText('Manuscript is running')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Show'), 'error');
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Log entries' })).queryAllByRole('listitem'),
      ).toHaveLength(1),
    );
    expect(server.requests.at(-1)?.searchParams.get('level')).toBe('error');
    expect(screen.getByRole('link', { name: 'Download the bundle' })).toHaveAttribute(
      'href',
      '/api/diagnostics/bundle',
    );
  });
});
