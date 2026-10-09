import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { makePdf } from '../apps/server/test/fixtures/sources/builders';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { startServer, stopServer } from './server';

/**
 * Task 10.12: with the built-in test model (SKB_AI_PROVIDER=mock), a question about an imported
 * PDF gets an answer whose citation opens the cited page; without a provider (the shared server),
 * the Ask panel and Settings explain how to set AI up and nothing else changes.
 */

/** Not the shared server's 4399, nor the other own-server tests' 4398, 4397 and 4396. */
const PORT = 4395;
const origin = `http://127.0.0.1:${PORT}`;
const auth = { Authorization: `Bearer ${E2E_TOKEN}` };

test('a grounded answer cites the page it comes from', async ({ page }) => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-ask-'));
  const server = await startServer(dir, PORT, { SKB_AI_PROVIDER: 'mock' });
  try {
    const imported = await page.request.post(`${origin}/api/sources`, {
      headers: auth,
      multipart: {
        file: {
          name: 'Consensus.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from(
            makePdf([
              ['Lecture 4: Consensus', 'An overview of the week.'],
              ['Raft elects a leader for each term by a majority vote.'],
            ]),
          ),
        },
      },
    });
    expect(imported.status()).toBe(201);
    const sourceId = ((await imported.json()) as { source: { id: string } }).source.id;
    await expect
      .poll(
        async () =>
          (
            (await (
              await page.request.get(`${origin}/api/sources/${sourceId}`, { headers: auth })
            ).json()) as {
              status: string;
            }
          ).status,
        { timeout: 30_000 },
      )
      .toBe('ready');

    await page.goto(`${origin}/auth?token=${E2E_TOKEN}&next=/library/${sourceId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Consensus' })).toBeVisible();
    await page.keyboard.press('Control+j');
    const panel = page.getByRole('dialog', { name: 'Ask your material' });
    await expect(panel.getByRole('checkbox', { name: 'Only this source' })).toBeChecked();
    await panel.getByRole('textbox', { name: 'Question' }).fill('How does Raft elect a leader?');
    await panel.getByRole('textbox', { name: 'Question' }).press('Enter');
    const answer = panel.getByRole('region', { name: 'Answer' });
    await expect(answer.getByText('From your sources')).toBeVisible();
    await expect(answer).toContainText('Raft elects a leader for each term by a majority vote');
    expect(await seriousViolations(page)).toEqual([]);

    const citation = answer.getByRole('link', { name: '[S1]' });
    await expect(citation).toHaveAttribute('href', `/library/${sourceId}?page=2`);
    await citation.click();
    await expect(panel).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/library/${sourceId}\\?page=2$`, 'u'));

    // The answer is still there when the panel opens again, and Settings shows test mode.
    await page.keyboard.press('Control+j');
    await expect(panel.getByText('From your sources')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goto(`${origin}/settings`);
    await expect(page.getByText(/Test mode: a built-in test model answers/u)).toBeVisible();
    await expect(page.getByText(/1 requests|\d+ requests/u)).toBeVisible();
  } finally {
    await stopServer(server);
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});

test('without a provider, asking explains how to set AI up', async ({ page }) => {
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await page.getByRole('button', { name: /Ask…/u }).click();
  const panel = page.getByRole('dialog', { name: 'Ask your material' });
  await expect(panel.getByText(/Asking needs an AI model, and none is set up/u)).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  await panel.getByRole('link', { name: 'Set up AI in Settings' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByText(/AI is off\. Everything else works without it/u)).toBeVisible();
});
