import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { makePdf } from '../apps/server/test/fixtures/sources/builders';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { startServer, stopServer } from './server';
import { expectPageTitle } from './titles';

/**
 * Tasks 10.12 and 13.09: with the built-in test model (SKB_AI_PROVIDER=mock), a question put to the
 * chat panel about an imported PDF gets an answer whose citation opens the cited page, and the
 * conversation is kept; without a provider (the shared server), the panel and Settings explain how
 * to set AI up and nothing else changes.
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
    await expectPageTitle(page, 'Consensus');
    await page.keyboard.press('Control+j');
    const panel = page.getByRole('complementary', { name: 'Chat panel' });
    await expect(panel.getByRole('checkbox', { name: 'Only this source' })).toBeChecked();
    await panel.getByRole('textbox', { name: 'Message' }).fill('How does Raft elect a leader?');
    await panel.getByRole('textbox', { name: 'Message' }).press('Enter');
    const answer = panel.getByRole('article', { name: 'Assistant' });
    await expect(answer.getByText('From your sources')).toBeVisible();
    await expect(answer).toContainText('Raft elects a leader for each term by a majority vote');
    // The panel is scanned on its own: the PDF beside it is still drawing its pages.
    expect(await seriousViolations(page, { include: '[data-chat-panel]' })).toEqual([]);

    // The citation opens the page it comes from, and the panel stays beside it.
    const citation = answer.getByRole('link', { name: '[S1]' });
    await expect(citation).toHaveAttribute('href', `/library/${sourceId}?page=2`);
    await citation.click();
    await expect(page).toHaveURL(new RegExp(`/library/${sourceId}\\?page=2$`, 'u'));
    await expect(panel).toBeVisible();

    // The conversation is kept: it is in the Chat page's list, with its answer.
    await page.goto(`${origin}/chat`);
    const title = /How does Raft elect a leader\?/u;
    const list = page.getByRole('list', { name: 'Conversations' });
    await list.getByRole('link', { name: title }).click();
    await expect(page.getByRole('article', { name: 'Assistant' })).toContainText(
      'Raft elects a leader for each term by a majority vote',
    );
    expect(await seriousViolations(page)).toEqual([]);
    await page.goto(`${origin}/settings`);
    await expect(page.getByText(/Test mode: a built-in test model answers/u)).toBeVisible();
    await expect(page.getByText(/1 requests|\d+ requests/u)).toBeVisible();
  } finally {
    await stopServer(server);
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});

test('without a provider, the chat panel explains how to set AI up', async ({ page }) => {
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await expectPageTitle(page, 'Today');
  // The sidebar starts collapsed: its chat button is the icon named for what it does.
  await page.getByRole('button', { name: 'Chat about your material' }).click();
  const panel = page.getByRole('complementary', { name: 'Chat panel' });
  await expect(panel.getByText(/Choose a provider and model for answers/u)).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Message' })).toBeDisabled();
  expect(await seriousViolations(page)).toEqual([]);
  await panel.getByRole('link', { name: 'Set up AI in Settings' }).click();
  await expectPageTitle(page, 'Settings');
  await expect(page.getByText(/AI is off\. Everything else works without it/u)).toBeVisible();
});
