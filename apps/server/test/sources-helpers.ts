import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  ImportResultSchema,
  SearchResponseSchema,
  type SearchResult,
  type ServerEvent,
  SourceSummarySchema,
} from '@skb/core';
import { expect } from 'vitest';
import { z } from 'zod';
import { createTestApp } from './helpers';

/**
 * The whole app on a temporary vault, for source-library tests. The job worker loop is not
 * started: `settle()` runs reconciliation and due jobs explicitly, so tests are deterministic.
 */
export function createSourcesTestbed() {
  const harness = createTestApp();
  const events: ServerEvent[] = [];
  harness.ctx.events.subscribe((event) => events.push(event));
  const abs = (relative: string) => path.join(harness.ctx.vault.root, ...relative.split('/'));
  const { modules } = harness;

  const json = async <T>(response: Response, schema: z.ZodType<T>, status = 200): Promise<T> => {
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(status);
    return schema.parse(body);
  };

  const upload = (name: string, bytes: Uint8Array, moduleCode?: string) => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)]), name);
    if (moduleCode !== undefined) form.append('module', moduleCode);
    return harness.request('/api/sources', { method: 'POST', body: form });
  };
  const search = async (q: string) =>
    json(await harness.request(`/api/search?q=${encodeURIComponent(q)}`), SearchResponseSchema);

  return {
    ...harness,
    events,
    abs,
    upload,
    search,
    async start() {
      await modules.notes.start({ watch: false });
      await modules.sources.start();
    },
    /** Runs reconciliation and jobs until nothing is left to do. */
    async settle() {
      for (let round = 0; round < 50; round += 1) {
        await modules.sources.reconciler.whenIdle();
        const ran = await modules.jobs.runDue();
        await modules.sources.reconciler.whenIdle();
        if (ran === 0) return;
      }
      throw new Error('Jobs did not settle.');
    },
    async imported(name: string, bytes: Uint8Array, moduleCode?: string) {
      const response = await upload(name, bytes, moduleCode);
      const body = await response.json();
      expect([200, 201], JSON.stringify(body)).toContain(response.status);
      return ImportResultSchema.parse(body);
    },
    async source(id: string) {
      return json(await harness.request(`/api/sources/${id}`), SourceSummarySchema.passthrough());
    },
    async list() {
      return (
        await json(
          await harness.request('/api/sources'),
          z.object({ sources: z.array(SourceSummarySchema) }),
        )
      ).sources;
    },
    /** The source results of a search. */
    async sourceHits(q: string): Promise<Extract<SearchResult, { kind: 'source' }>[]> {
      return (await search(q)).results.flatMap((result) =>
        result.kind === 'source' ? [result] : [],
      );
    },
    write(relative: string, content: string | Uint8Array) {
      mkdirSync(path.dirname(abs(relative)), { recursive: true });
      writeFileSync(abs(relative), content);
    },
    read(relative: string) {
      return readFileSync(abs(relative));
    },
    remove(relative: string) {
      rmSync(abs(relative), { force: true });
    },
    move(from: string, to: string) {
      mkdirSync(path.dirname(abs(to)), { recursive: true });
      renameSync(abs(from), abs(to));
    },
    /** Tells the index about files changed behind its back (what the watcher does). */
    changed(changed: string[], removed: string[] = []) {
      modules.notes.indexer.apply({ changed, removed }, 'external');
    },
  };
}

export type SourcesTestbed = ReturnType<typeof createSourcesTestbed>;
