import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  AiError,
  AiSettingsSchema,
  AiStatusSchema,
  ProviderSchema,
  UsageReportSchema,
} from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { jsonApi } from '../../../test/api-helpers';
import { createTestContext, type TestContext } from '../../../test/helpers';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';
import { silentLogger } from '../../shared/logger';
import { createModelRegistry } from './registry';
import { createAiService } from './service';
import { createFileConfigStore, createMemoryStores } from './store';
import { createUsageRepository } from './usage';

let bed: SourcesTestbed | undefined;
let context: TestContext | undefined;
afterEach(() => {
  bed?.cleanup();
  context?.cleanup();
  bed = undefined;
  context = undefined;
});

const KEY = 'sk-test-0123456789abcdefghijklmnop';

describe('AI settings over the API', () => {
  it('stores keys outside the vault and never returns them', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    const api = jsonApi(bed.request);
    const initial = await api.get('/api/ai/settings', AiSettingsSchema);
    expect(initial.providers).toEqual([]);
    expect(initial.status).toMatchObject({
      enabled: false,
      mock: false,
      roles: { chat: { ready: false, reason: 'Choose a provider and model for answers.' } },
    });

    const provider = await api.post(
      '/api/ai/providers',
      { kind: 'openai', name: 'OpenAI', apiKey: KEY },
      201,
      ProviderSchema,
    );
    expect(provider).toEqual({
      id: 'openai',
      kind: 'openai',
      name: 'OpenAI',
      baseUrl: null,
      hasKey: true,
    });
    await api.patch(
      '/api/ai/preferences',
      { roles: { chat: { providerId: 'openai', model: 'gpt-test' } } },
      200,
    );
    const response = await bed.request('/api/ai/settings');
    const text = await response.text();
    expect(text).not.toContain(KEY);
    const settings = AiSettingsSchema.parse(JSON.parse(text));
    expect(settings.status.enabled).toBe(true);
    expect(settings.status.roles.chat.label).toBe('OpenAI · gpt-test');

    // The key is in the data directory, not the vault, and readable by the owner only.
    const { dataDir, vaultPath } = bed.ctx.config;
    const secretsFile = path.join(dataDir, 'secrets.json');
    expect(readFileSync(secretsFile, 'utf8')).toContain(KEY);
    expect(readFileSync(path.join(dataDir, 'ai.json'), 'utf8')).not.toContain(KEY);
    expect(secretsFile.startsWith(vaultPath)).toBe(false);
    if (process.platform !== 'win32') expect(statSync(secretsFile).mode & 0o077).toBe(0);

    // A second provider of the same name gets its own id; removing one clears the roles using it.
    const local = await api.post(
      '/api/ai/providers',
      { kind: 'openai-compatible', name: 'OpenAI', baseUrl: 'http://127.0.0.1:11434/v1' },
      201,
      ProviderSchema,
    );
    expect(local).toMatchObject({ id: 'openai-2', hasKey: false });
    await api.post('/api/ai/providers', { kind: 'openai-compatible', name: 'No address' }, 400);
    await api.patch('/api/ai/providers/openai', { apiKey: null }, 200);
    expect((await api.get('/api/ai/status', AiStatusSchema)).roles.chat.reason).toBe(
      'Add an API key for OpenAI.',
    );
    await api.delete('/api/ai/providers/openai');
    const after = await api.get('/api/ai/settings', AiSettingsSchema);
    expect(after.preferences.roles.chat.providerId).toBeNull();
    expect(readFileSync(secretsFile, 'utf8')).not.toContain(KEY);
  });

  it('falls back to defaults when the settings file is damaged', () => {
    context = createTestContext();
    const dir = context.ctx.config.dataDir;
    const store = createFileConfigStore(dir, silentLogger);
    expect(existsSync(path.join(dir, 'ai.json'))).toBe(false);
    store.write({
      ...store.read(),
      providers: [{ id: 'x', kind: 'openai', name: 'X', baseUrl: null }],
    });
    writeFileSync(path.join(dir, 'ai.json'), '{ not json');
    expect(createFileConfigStore(dir, silentLogger).read().providers).toEqual([]);
  });
});

/** A stand-in for an OpenAI-compatible server. */
function fakeServer(status = 200) {
  const requests: { url: string; authorization: string | null; body: unknown }[] = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      url: String(input),
      authorization: headers.get('authorization'),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (status !== 200)
      return new Response(
        JSON.stringify({ error: { message: `Incorrect API key provided: ${KEY}`, type: 'auth' } }),
        { status, headers: { 'content-type': 'application/json' } },
      );
    const url = String(input);
    const body = url.endsWith('/embeddings')
      ? {
          object: 'list',
          data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3] }],
          model: 'e',
          usage: { prompt_tokens: 3, total_tokens: 3 },
        }
      : {
          id: 'c1',
          object: 'chat.completion',
          created: 1,
          model: 'm',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13 },
        };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch, requests };
}

function service(fetch?: typeof globalThis.fetch, mock = false) {
  context = createTestContext();
  const { config, secrets } = createMemoryStores();
  const usage = createUsageRepository(context.ctx.db);
  return createAiService({
    store: config,
    secrets,
    registry: createModelRegistry({ store: config, secrets, mock, fetch }),
    usage,
    mock,
    clock: context.clock,
    ids: context.ctx.ids,
    logger: silentLogger,
  });
}

describe('connection tests', () => {
  it('sends the key to the provider and records what the test used', async () => {
    const server = fakeServer();
    const ai = service(server.fetch);
    ai.createProvider({
      kind: 'openai-compatible',
      name: 'Local',
      baseUrl: 'http://127.0.0.1:9/v1',
      apiKey: KEY,
    });
    const result = await ai.testProvider('local', 'llama-test', 'chat');
    expect(result).toMatchObject({ ok: true, message: 'Connected: llama-test answered.' });
    expect(server.requests[0]).toMatchObject({
      url: 'http://127.0.0.1:9/v1/chat/completions',
      authorization: `Bearer ${KEY}`,
      body: { model: 'llama-test' },
    });
    const embedding = await ai.testProvider('local', 'embed-test', 'embedding');
    expect(embedding.message).toBe('Connected: embed-test returns vectors of 3 numbers.');
    const report = UsageReportSchema.parse(ai.usageReport());
    expect(report.totals).toMatchObject({ requests: 2, inputTokens: 15, outputTokens: 1 });
    expect(report.recent[0]).toMatchObject({ purpose: 'connection test', role: 'embedding' });
  });

  it('explains a refused key without repeating it', async () => {
    const ai = service(fakeServer(401).fetch);
    ai.createProvider({
      kind: 'openai-compatible',
      name: 'Local',
      baseUrl: 'http://127.0.0.1:9/v1',
      apiKey: KEY,
    });
    const result = await ai.testProvider('local', 'llama-test', 'chat');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/^The provider refused the key \(401\)/u);
    expect(result.message).not.toContain('0123456789abcdef');
    expect(
      (
        await service()
          .testProvider('none', 'm', 'chat')
          .catch((error) => error)
      ).message,
    ).toBe('That provider does not exist.');
  });
});

describe('budgets and the test model', () => {
  it('warns at 80 % and refuses requests once the month is spent', () => {
    const ai = service(undefined, true);
    ai.updatePreferences({
      monthlyBudget: 1,
      roles: { chat: { inputPrice: 10, outputPrice: 30 } },
    });
    const chat = ai.require('chat');
    expect(chat.provider).toBe('mock');
    // 50,000 in × $10/M + 10,000 out × $30/M = $0.80.
    expect(ai.record(chat, 'ask', 50_000, 10_000).cost).toBeCloseTo(0.8);
    expect(ai.status().month).toMatchObject({ warning: true, exhausted: false });
    ai.record(chat, 'ask', 20_000, 0);
    expect(ai.status().month).toMatchObject({ exhausted: true });
    const refused = (() => {
      try {
        ai.require('chat');
      } catch (error) {
        return error;
      }
    })();
    expect(refused).toBeInstanceOf(AiError);
    expect(refused).toMatchObject({ reason: 'budget', status: 429 });
    // Next month the budget starts again.
    context?.clock.advance(32 * 86_400_000);
    expect(ai.require('chat').modelId).toBe('mock-chat');
  });

  it('says what is missing when AI is not set up', () => {
    const ai = service();
    expect(() => ai.require('chat')).toThrow('Choose a provider and model for answers.');
    expect(ai.embeddingModel()).toBeNull();
    ai.createProvider({ kind: 'anthropic', name: 'Anthropic', apiKey: KEY });
    ai.updatePreferences({ roles: { embedding: { providerId: 'anthropic', model: 'x' } } });
    expect(ai.status().roles.embedding.reason).toMatch(/Anthropic has no embedding models/u);
  });
});
