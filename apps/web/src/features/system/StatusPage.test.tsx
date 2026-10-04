import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../../lib/api/client';
import { ApiProvider } from '../../lib/api/context';
import { createQueryClient } from '../../lib/queryClient';
import { formatUptime, StatusPage } from './StatusPage';

const health = {
  status: 'ok',
  version: '0.1.0',
  mode: 'development',
  startedAt: '2026-10-04T12:00:00.000Z',
  uptimeSeconds: 3725,
  vault: { id: 'vault_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7', name: 'Dev Vault', path: 'C:/Vaults/Dev Vault' },
  database: {
    ok: true,
    sqliteVersion: '3.51.2',
    appliedMigrations: 1,
    latestMigration: '0001_init',
  },
};

function renderWith(fetch: typeof globalThis.fetch) {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  return render(
    <ApiProvider client={createApiClient({ fetch })}>
      <QueryClientProvider client={queryClient}>
        <StatusPage />
      </QueryClientProvider>
    </ApiProvider>,
  );
}

describe('StatusPage', () => {
  it('shows health details when the server is healthy', async () => {
    renderWith(async () => new Response(JSON.stringify(health), { status: 200 }));
    expect(screen.getByRole('status')).toHaveTextContent('Checking the local server');
    expect(await screen.findByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Dev Vault — C:/Vaults/Dev Vault')).toBeInTheDocument();
    expect(screen.getByText('SQLite 3.51.2, 1 migration applied')).toBeInTheDocument();
    expect(screen.getByText('1 h 2 min')).toBeInTheDocument();
  });

  it('explains how to sign in when the API returns 401', async () => {
    const problem = {
      type: 'urn:skb:problem:unauthenticated',
      title: 'Authentication required',
      status: 401,
      code: 'unauthenticated',
    };
    renderWith(async () => new Response(JSON.stringify(problem), { status: 401 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in required');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('offers a retry when the server cannot be reached', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify(health), { status: 200 }));
    renderWith(fetch);
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the local server');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Healthy')).toBeInTheDocument();
  });
});

describe('formatUptime', () => {
  it.each([
    [5, '5 s'],
    [59, '59 s'],
    [60, '1 min'],
    [3599, '59 min'],
    [3600, '1 h'],
    [3725, '1 h 2 min'],
  ])('formats %d seconds as %s', (seconds, expected) => {
    expect(formatUptime(seconds)).toBe(expected);
  });
});
