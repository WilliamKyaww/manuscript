import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, test } from '@playwright/test';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { startServer, stopServer } from './server';

/**
 * Phase 12: an MCP client starts the built stdio bridge (`mcp.mjs`), which relays to the running
 * application; what it changes shows in Settings → Assistant actions, where the person can undo
 * it, and a tool they switch off stops working for the client.
 */

/** Not the shared server's 4399, nor the other own-server tests' 4398–4394. */
const PORT = 4393;
const origin = `http://127.0.0.1:${PORT}`;
const auth = { Authorization: `Bearer ${E2E_TOKEN}` };

const text = (result: unknown) =>
  ((result as { content: { text: string }[] }).content[0] as { text: string }).text;

test('an MCP client changes a note, the person sees it in Settings and undoes it', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-agent-'));
  const server = await startServer(dir, PORT);
  const client = new Client({ name: 'e2e-client', version: '1.0.0' });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [path.resolve('apps/server/dist/mcp.mjs')],
        env: { PATH: process.env.PATH ?? '', SKB_PORT: String(PORT), SKB_MCP_TOKEN: E2E_TOKEN },
        stderr: 'pipe',
      }),
    );
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toContain('create_note');
    expect(names).not.toContain('delete_note');

    const created = await client.callTool({
      name: 'create_note',
      arguments: { title: 'From Claude', content: 'Written through MCP.\n' },
    });
    expect(created.isError).toBeFalsy();
    const notes = async () =>
      (
        (await (await page.request.get(`${origin}/api/notes`, { headers: auth })).json()) as {
          notes: { title: string }[];
        }
      ).notes.map((note) => note.title);
    expect(await notes()).toContain('From Claude');

    // The person sees it, marked as an MCP client's, and undoes it.
    await page.goto(`${origin}/auth?token=${E2E_TOKEN}&next=/settings`);
    const section = page.getByRole('region', { name: 'Assistant actions' });
    const row = section.getByRole('list', { name: 'Recent actions' }).getByRole('listitem').first();
    await expect(row).toContainText('Created the note “From Claude”');
    await expect(row).toContainText('MCP client');
    expect(await seriousViolations(page)).toEqual([]);
    await row.getByRole('button', { name: 'Undo' }).click();
    await expect(row.getByText('Undone')).toBeVisible();
    expect(await notes()).not.toContain('From Claude');

    // A tool switched off in Settings stops working for the client, with a reason it can read.
    await section
      .getByRole('combobox', { name: 'Permission for create_note' })
      .selectOption('deny');
    await expect
      .poll(async () => {
        const refused = await client.callTool({
          name: 'create_note',
          arguments: { title: 'Blocked' },
        });
        return refused.isError ? text(refused) : 'allowed';
      })
      .toMatch(/turned this tool off/u);
    expect(await notes()).not.toContain('Blocked');
  } finally {
    await client.close();
    await stopServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
});
