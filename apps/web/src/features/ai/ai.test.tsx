import { DEFAULT_AI_PREFERENCES } from '@skb/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { json, notFound } from '../../test/practice-fixtures';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';

const KEY = 'sk-secret-0123456789abcdefghij';

const role = (ready: boolean, reason: string | null, label: string | null = null) => ({
  ready,
  reason,
  label,
});
const status = (enabled: boolean) => ({
  enabled,
  mock: false,
  roles: {
    chat: enabled
      ? role(true, null, 'OpenAI · gpt-test')
      : role(false, 'Choose a provider and model for answers.'),
    fast: role(false, 'Choose a provider and model for quick tasks.'),
    embedding: role(false, 'Choose a provider and model for semantic search.'),
    transcription: role(false, 'Choose a provider and model for transcribing recordings.'),
  },
  month: {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    budget: 10,
    warning: false,
    exhausted: false,
  },
});
const usage = {
  month: '2026-10',
  totals: { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
  byModel: [],
  recent: [],
};

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

function fakeServer(options: { enabled?: boolean } = {}) {
  const calls: Call[] = [];
  const providers: Record<string, unknown>[] = [];
  const fetch: FakeFetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, path: url.pathname, body });
    const path = url.pathname;
    if (path === '/api/health') return json(HEALTH);
    if (path === '/api/ai/status') return json(status(options.enabled ?? false));
    if (path === '/api/ai/settings')
      return json({
        providers,
        preferences: DEFAULT_AI_PREFERENCES,
        status: status(options.enabled ?? false),
      });
    if (path === '/api/ai/usage') return json(usage);
    if (path === '/api/ai/embeddings')
      return json({ model: null, embedded: 0, total: 0, running: false, error: null });
    if (path === '/api/ai/providers' && method === 'POST') {
      const provider = {
        id: 'openai',
        kind: body?.kind,
        name: body?.name,
        baseUrl: null,
        hasKey: Boolean(body?.apiKey),
      };
      providers.push(provider);
      return json(provider, 201);
    }
    if (path === '/api/ai/providers/openai/test')
      return json({
        ok: false,
        message: 'The provider refused the key (401): [hidden]',
        latencyMs: 20,
      });
    if (path === '/api/ai/preferences')
      return json({ providers, preferences: DEFAULT_AI_PREFERENCES, status: status(true) });
    return notFound();
  };
  return {
    fetch,
    calls,
    find: (method: string, path: string) =>
      calls.filter((c) => c.method === method && c.path === path),
  };
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => {
  resetUiState();
});

describe('Settings → AI', () => {
  it('adds a provider without ever showing its key, and reports a failed connection test', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderApp('/settings', server.fetch);
    const section = await screen.findByRole('region', { name: 'AI' });
    expect(await within(section).findByText(/AI is off/u)).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Add a provider' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a provider' });
    await user.selectOptions(within(dialog).getByLabelText('Kind'), 'openai');
    await user.type(within(dialog).getByLabelText('Name'), 'OpenAI');
    await user.type(within(dialog).getByLabelText('API key'), KEY);
    await user.click(within(dialog).getByRole('button', { name: 'Add provider' }));
    await waitFor(() => expect(server.find('POST', '/api/ai/providers')).toHaveLength(1));
    expect(server.find('POST', '/api/ai/providers')[0]?.body).toEqual({
      kind: 'openai',
      name: 'OpenAI',
      apiKey: KEY,
    });
    const list = await within(section).findByRole('list', { name: 'Providers' });
    expect(within(list).getByText('Key saved')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(KEY);

    // Choose it for answers and test the connection.
    const answers = within(section).getAllByRole('combobox', {
      name: 'Provider',
    })[0] as HTMLElement;
    await user.selectOptions(answers, 'openai');
    await user.type(within(section).getAllByLabelText('Model')[0] as HTMLElement, 'gpt-test');
    await user.click(within(section).getAllByRole('button', { name: /Test/u })[0] as HTMLElement);
    expect(await within(section).findByRole('status')).toHaveTextContent(
      'The provider refused the key (401)',
    );
    expect(server.find('POST', '/api/ai/providers/openai/test')[0]?.body).toEqual({
      model: 'gpt-test',
      role: 'chat',
    });
    // Typing a long key character by character is slow when the whole suite runs at once.
  }, 15_000);
});
