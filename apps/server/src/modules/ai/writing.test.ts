import { WritingResultSchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { jsonApi } from '../../../test/api-helpers';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';
import { tidy } from './writing';

/** Writing help on a selection (Phase 26): POST /api/ai/write. */

let bed: SourcesTestbed | undefined;
afterEach(() => {
  bed?.cleanup();
  bed = undefined;
});

async function api(mock: boolean) {
  bed = createSourcesTestbed({ config: { aiMock: mock } });
  await bed.start();
  return jsonApi(bed.request);
}

describe('writing help', () => {
  it('answers each action with the text changed, and records the use', async () => {
    const http = await api(true);
    const improved = await http.post(
      '/api/ai/write',
      {
        action: 'improve',
        text: 'models do well on lab photos. they do worse in fields',
        title: 'Draft',
      },
      200,
      WritingResultSchema,
    );
    expect(improved.text).toBe('Models do well on lab photos. They do worse in fields.');
    const fixed = await http.post(
      '/api/ai/write',
      { action: 'proofread', text: 'i think teh  model works' },
      200,
      WritingResultSchema,
    );
    expect(fixed.text).toBe('I think the model works.');
    const custom = await http.post(
      '/api/ai/write',
      { action: 'custom', text: 'Grad-CAM shows where', instruction: 'Translate into French' },
      200,
      WritingResultSchema,
    );
    expect(custom.text).toContain('Translate into French');
    const usage = await http.get<{ recent: { purpose: string }[] }>('/api/ai/usage');
    expect(JSON.stringify(usage)).toContain('writing help (improve)');
  });

  it('refuses an empty selection, a custom action without an instruction, and too much text', async () => {
    const http = await api(true);
    await http.post('/api/ai/write', { action: 'improve', text: '   ' }, 400);
    await http.post('/api/ai/write', { action: 'custom', text: 'x' }, 400);
    await http.post('/api/ai/write', { action: 'improve', text: 'x'.repeat(20_001) }, 400);
    await http.post('/api/ai/write', { action: 'rewrite-everything', text: 'x' }, 400);
  });

  it('says AI is not set up when there is no model', async () => {
    const http = await api(false);
    const problem = await http.post<{ code: string; detail: string }>(
      '/api/ai/write',
      { action: 'improve', text: 'Some text.' },
      409,
    );
    expect(problem.code).toBe('ai_not_configured');
  });

  it('takes off a fence or quotation marks a model put around the whole answer', () => {
    expect(tidy('```markdown\n- a\n- b\n```')).toBe('- a\n- b');
    expect(tidy('"A sentence."')).toBe('A sentence.');
    expect(tidy('He said "no" twice.')).toBe('He said "no" twice.');
  });
});
