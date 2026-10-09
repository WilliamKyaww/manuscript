import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, notFound } from '../../test/practice-fixtures';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';

const NOW = '2026-10-09T10:00:00.000Z';
const ACT_DONE = 'act_01J9Z3K4M2Q8R5T7V9X1Y3Z5K1';
const ACT_STALE = 'act_01J9Z3K4M2Q8R5T7V9X1Y3Z5K2';
const ACT_DENIED = 'act_01J9Z3K4M2Q8R5T7V9X1Y3Z5K3';

const action = (id: string, extra: Record<string, unknown>) => ({
  id,
  tool: 'create_note',
  risk: 'write',
  actor: 'agent',
  status: 'executed',
  approval: 'auto',
  summary: 'Created the note “Summary”',
  input: {},
  output: {},
  error: null,
  createdAt: NOW,
  undoneAt: null,
  undoable: true,
  ...extra,
});

const tool = (name: string, risk: string, category: string, permission: string | null = null) => ({
  name,
  category,
  description: `Does ${name}.`,
  risk,
  permission,
  mcp: risk !== 'destructive',
});

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

function fakeServer() {
  const calls: Call[] = [];
  const tools = [
    tool('search_knowledge', 'read', 'knowledge'),
    tool('create_note', 'write', 'knowledge'),
    tool('delete_note', 'destructive', 'knowledge'),
  ];
  const fetch: FakeFetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, path: url.pathname, body });
    const path = url.pathname;
    if (path === '/api/health') return json(HEALTH);
    if (path === '/api/agent/tools') return json({ tools });
    if (path === '/api/agent/actions')
      return json({
        actions: [
          action(ACT_DONE, {}),
          action(ACT_STALE, {
            summary: 'Updated the note Paxos.md',
            tool: 'update_note',
            undoable: false,
          }),
          action(ACT_DENIED, {
            tool: 'delete_note',
            risk: 'destructive',
            status: 'denied',
            summary: 'Moved the note Old to the trash',
            error: 'The user declined.',
            undoable: false,
          }),
        ],
      });
    if (path === `/api/agent/actions/${ACT_DONE}/undo`)
      return json(action(ACT_DONE, { status: 'undone', undoable: false }));
    const permission = path.match(/^\/api\/agent\/tools\/([a-z_]+)\/permission$/u);
    if (permission && method === 'PUT') {
      const found = tools.find((entry) => entry.name === permission[1]);
      if (!found) return notFound();
      found.permission = (body?.permission as string | null) ?? null;
      return json(found);
    }
    return notFound();
  };
  return {
    fetch,
    find: (method: string, path: string) =>
      calls.filter((c) => c.method === method && c.path === path),
  };
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => resetUiState());

describe('Settings → Assistant actions', () => {
  it('lists what the assistant did and undoes an action that can still be undone', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderApp('/settings', server.fetch);
    const section = await screen.findByRole('region', { name: 'Assistant actions' });
    const list = await within(section).findByRole('list', { name: 'Recent actions' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(
      within(rows[0] as HTMLElement).getByText('Created the note “Summary”'),
    ).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('Done')).toBeInTheDocument();
    // A change that something has changed since cannot be undone, and says why.
    const stale = within(rows[1] as HTMLElement).getByRole('button', { name: /Undo/u });
    expect(stale).toBeDisabled();
    expect(stale).toHaveAttribute('title', expect.stringMatching(/changed since/u));
    // A refused call shows why and offers no undo.
    expect(within(rows[2] as HTMLElement).getByText('Not allowed')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).queryByRole('button', { name: /Undo/u })).toBeNull();

    await user.click(within(rows[0] as HTMLElement).getByRole('button', { name: /Undo/u }));
    await waitFor(() =>
      expect(server.find('POST', `/api/agent/actions/${ACT_DONE}/undo`)).toHaveLength(1),
    );
  });

  it('sets a tool’s permission, never offering to let a destructive tool run unasked', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderApp('/settings', server.fetch);
    const section = await screen.findByRole('region', { name: 'Assistant actions' });
    const write = await within(section).findByRole('combobox', {
      name: 'Permission for create_note',
    });
    expect(
      within(write)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Allowed, logged', 'Ask each time', 'Off']);
    const destructive = within(section).getByRole('combobox', {
      name: 'Permission for delete_note',
    });
    expect(
      within(destructive)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Ask every time', 'Off']);

    await user.selectOptions(write, 'ask');
    await waitFor(() =>
      expect(server.find('PUT', '/api/agent/tools/create_note/permission')[0]?.body).toEqual({
        permission: 'ask',
      }),
    );
    await user.selectOptions(write, 'default');
    await waitFor(() =>
      expect(server.find('PUT', '/api/agent/tools/create_note/permission')[1]?.body).toEqual({
        permission: null,
      }),
    );
  });
});
