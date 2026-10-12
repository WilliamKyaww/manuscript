import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { graphifyBytes, raftRepository } from '../apps/server/test/fixtures/graphify';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { startServer, stopServer } from './server';
import { expectPageTitle } from './titles';

/**
 * Task 16.01–16.09: everything can leave and come back. The student exports, restores the export into
 * a new folder, looks at that folder before opening it, imports the graph of a coursework repository
 * and decides which code implements a concept — all from Settings → Data and the concept's page.
 */

/** Not the shared server's 4399, nor the other own-server tests' 4398–4389. */
const PORT = 4388;
const origin = `http://127.0.0.1:${PORT}`;
const auth = { Authorization: `Bearer ${E2E_TOKEN}` };

async function post<T>(request: APIRequestContext, url: string, data: unknown): Promise<T> {
  const response = await request.post(`${origin}${url}`, { headers: auth, data });
  expect(response.status(), `${url}: ${await response.text()}`).toBeLessThan(300);
  return (await response.json()) as T;
}

test('export, restore, open another vault and link code to a concept', async ({ page }) => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-portability-'));
  const server = await startServer(dir, PORT);
  try {
    const module = await post<{ id: string }>(page.request, '/api/modules', {
      code: 'CS301',
      title: 'Distributed Systems',
      credits: 15,
    });
    const raft = await post<{ id: string }>(page.request, '/api/concepts', {
      name: 'Raft',
      summary: 'A consensus algorithm built around a leader.',
      moduleIds: [module.id],
    });
    await post(page.request, '/api/notes', {
      title: 'Raft notes',
      content: '# Raft notes\n\nLeaders are elected by a majority.\n',
    });

    // 1. Export everything.
    await page.goto(`${origin}/auth?token=${E2E_TOKEN}&next=/settings`);
    await expectPageTitle(page, 'Settings');
    await page.getByRole('button', { name: 'Export everything' }).click();
    const exports = page.getByRole('list', { name: 'Exports' });
    await expect(exports.getByRole('link', { name: 'Download' })).toBeVisible({ timeout: 30_000 });
    expect(await seriousViolations(page)).toEqual([]);

    // The download is a zip that starts with its manifest.
    const href = (await exports.getByRole('link', { name: 'Download' }).getAttribute('href')) ?? '';
    const archive = await page.request.get(`${origin}${href}`, { headers: auth });
    expect(archive.status()).toBe(200);
    expect(archive.headers()['content-type']).toBe('application/zip');
    const bytes = await archive.body();
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(bytes.includes(Buffer.from('manifest.json'))).toBe(true);

    // 2. Restore it into a new folder: a separate vault, with the notes and the data.
    const target = path.join(dir, 'restored vault');
    const restore = page.getByRole('form', { name: 'Restore from an export' });
    await restore.getByLabel('New vault folder').fill(target);
    await restore
      .getByLabel('Export', { exact: true })
      .fill((await exports.locator('li').first().locator('span').first().textContent()) ?? '');
    await restore.getByRole('button', { name: 'Restore into a new vault' }).click();
    await expect
      .poll(() => existsSync(path.join(target, '.skb', 'skb.db')), { timeout: 30_000 })
      .toBe(true);
    await expect
      .poll(() => existsSync(path.join(target, 'Raft notes.md')), { timeout: 30_000 })
      .toBe(true);
    expect(readFileSync(path.join(target, 'Raft notes.md'), 'utf8')).toContain('majority');

    // 3. Look at the folder before opening it: it says what it is.
    const open = page.getByRole('form', { name: 'Open a folder' });
    await open.getByLabel('Open another folder as a vault').fill(target);
    await open.getByRole('button', { name: 'Look at it' }).click();
    await expect(page.getByText(/A Manuscript vault with 1 note./u)).toBeVisible();
    await page.getByRole('button', { name: 'Open this vault' }).click();
    await expect(page.getByText(/will open the next time you start Manuscript/u)).toBeVisible();

    // 4. Import the graph of a coursework repository.
    await page.getByLabel('graph.json').setInputFiles({
      name: 'raft-lab.json',
      mimeType: 'application/json',
      buffer: Buffer.from(graphifyBytes(raftRepository())),
    });
    await page
      .getByRole('form', { name: 'Import a graph' })
      .getByRole('button', { name: 'Import' })
      .click();
    await expect(page.getByText(/Imported “raft-lab”: 7 pieces of code/u)).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Imported graphs' }).getByText('2 suggested'),
    ).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // 5. On the concept's page, the suggestions wait for a decision.
    await page.goto(`${origin}/concepts/${raft.id}`);
    await expectPageTitle(page, 'Raft');
    const suggested = page.getByRole('list', { name: 'Suggested code' });
    await expect(suggested.getByRole('button', { name: 'Accept raft.py' })).toBeVisible();
    await suggested.getByRole('button', { name: 'Accept raft.py' }).click();
    await expect(
      page.getByRole('list', { name: 'Linked code' }).getByText('raft.py', { exact: true }),
    ).toBeVisible();
    await suggested.getByRole('button', { name: 'Reject RaftNode' }).click();
    await expect(page.getByRole('list', { name: 'Suggested code' })).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);

    // 6. The code is in the graph when asked for, joined to the concept.
    const graph = (await (
      await page.request.get(`${origin}/api/graph?types=concept&types=code`, { headers: auth })
    ).json()) as {
      nodes: { type: string; label: string }[];
      edges: { relation: string }[];
    };
    expect(graph.nodes.filter((node) => node.type === 'code').map((node) => node.label)).toContain(
      'raft.py',
    );
    expect(graph.edges.some((edge) => edge.relation === 'implemented_in')).toBe(true);
  } finally {
    await stopServer(server);
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});
