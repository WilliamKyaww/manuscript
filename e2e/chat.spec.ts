import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { makePptx } from '../apps/server/test/fixtures/sources/builders';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { startServer, stopServer } from './server';
import { expectPageTitle } from './titles';

/**
 * Tasks 13.11 and 13.12: with the built-in test model (SKB_AI_PROVIDER=mock), "Create flashcards
 * from lectures 1–3" shows every step as an activity row and ends in a result card that opens the
 * Inbox; deleting a note stops for approval, which can be declined or given once; and a Markdown
 * summary written from lectures and the student's own notes is made, linked to those notes, and shown.
 */

/** Not the shared server's 4399, nor the other own-server tests' 4398–4393. */
const PORTS = { cards: 4392, summary: 4391 };
const auth = { Authorization: `Bearer ${E2E_TOKEN}` };

const SLIDES = [
  {
    title: 'Two-phase commit',
    body: ['Two-phase commit is an atomic commitment protocol for distributed transactions.'],
  },
  {
    title: 'The coordinator',
    body: ['The coordinator is the node that collects a vote from every participant.'],
  },
  {
    title: 'Blocking',
    body: ['A participant is blocked when the coordinator fails after the votes are cast.'],
  },
];

/** A module with four lectures, each with the same imported slides, over the server's own API. */
async function seed(request: APIRequestContext, origin: string) {
  const imported = await request.post(`${origin}/api/sources`, {
    headers: auth,
    multipart: {
      file: {
        name: 'Consensus.pptx',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        buffer: Buffer.from(makePptx(SLIDES)),
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
            await request.get(`${origin}/api/sources/${sourceId}`, { headers: auth })
          ).json()) as { status: string }
        ).status,
      { timeout: 30_000 },
    )
    .toBe('ready');
  const module = (await (
    await request.post(`${origin}/api/modules`, {
      headers: auth,
      data: { code: 'CS301', title: 'Distributed Systems' },
    })
  ).json()) as { id: string };
  for (const key of ['L1', 'L2', 'L3', 'L4']) {
    const lecture = (await (
      await request.post(`${origin}/api/modules/${module.id}/lectures`, {
        headers: auth,
        data: { key, title: `Lecture ${key}` },
      })
    ).json()) as { id: string };
    await request.post(`${origin}/api/lectures/${lecture.id}/sources`, {
      headers: auth,
      data: { sourceId },
    });
  }
  return { sourceId };
}

test('flashcards from lectures 1–3 show their steps, and a deletion waits for approval', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const origin = `http://127.0.0.1:${PORTS.cards}`;
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-chat-cards-'));
  const server = await startServer(dir, PORTS.cards, { SKB_AI_PROVIDER: 'mock' });
  try {
    await seed(page.request, origin);
    const scratch = await page.request.post(`${origin}/api/notes`, {
      headers: auth,
      data: { title: 'Scratch', content: 'Throw-away thoughts.' },
    });
    expect(scratch.status()).toBe(201);
    const scratchId = ((await scratch.json()) as { id: string }).id;

    await page.goto(`${origin}/auth?token=${E2E_TOKEN}&next=/chat`);
    await expectPageTitle(page, 'Chat');
    const box = page.getByRole('textbox', { name: 'Message' });
    await box.fill('Create flashcards from lectures 1–3');
    await box.press('Enter');

    // Every step is an activity row; the last one made the cards and can be undone.
    const activity = page.getByRole('list', { name: 'Assistant activity' }).first();
    await expect(activity.getByRole('listitem').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Review in the Inbox' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect(page.getByText(/I created \d+ flashcards from lectures 1–3/u)).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByRole('link', { name: 'Review in the Inbox' }).click();
    await expectPageTitle(page, 'Inbox');
    await expect(page.locator('[data-draft]').first()).toBeVisible();

    // Deleting asks first. Declining leaves the note where it is.
    await page.goto(`${origin}/chat`);
    await box.fill('Please delete the note Scratch');
    await box.press('Enter');
    let card = page.getByRole('listitem', { name: /^Approval needed: / });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole('button', { name: 'Approve for this chat' })).toHaveCount(0);
    await expect(box).toBeDisabled();
    expect(await seriousViolations(page)).toEqual([]);
    await card.getByRole('button', { name: 'Decline' }).click();
    await expect(page.getByText(/left “Scratch” alone/u)).toBeVisible({ timeout: 30_000 });
    expect(
      (await page.request.get(`${origin}/api/notes/${scratchId}`, { headers: auth })).status(),
    ).toBe(200);

    // Asking again and approving once moves it to the trash, with an Undo that brings it back.
    await box.fill('Delete the note Scratch');
    await box.press('Enter');
    card = page.getByRole('listitem', { name: /^Approval needed: / });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByText(/moved “Scratch” to the trash/u)).toBeVisible({ timeout: 30_000 });
    expect(
      (await page.request.get(`${origin}/api/notes/${scratchId}`, { headers: auth })).status(),
    ).toBe(404);
    await page.getByRole('button', { name: 'Undo' }).last().click();
    await expect
      .poll(
        async () =>
          (await page.request.get(`${origin}/api/notes/${scratchId}`, { headers: auth })).status(),
        { timeout: 15_000 },
      )
      .toBe(200);
  } finally {
    await stopServer(server);
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});

test('a Markdown summary of lectures and my notes is written, linked and shown', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const origin = `http://127.0.0.1:${PORTS.summary}`;
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-chat-summary-'));
  const server = await startServer(dir, PORTS.summary, { SKB_AI_PROVIDER: 'mock' });
  try {
    await seed(page.request, origin);
    const mine = await page.request.post(`${origin}/api/notes`, {
      headers: auth,
      data: {
        title: 'My consensus notes',
        content: 'Consensus lets every node agree on one value even when the coordinator fails.',
      },
    });
    expect(mine.status()).toBe(201);
    await expect
      .poll(
        async () =>
          (
            (await (
              await page.request.get(`${origin}/api/search?q=consensus`, { headers: auth })
            ).json()) as { total: number }
          ).total,
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);

    await page.goto(`${origin}/auth?token=${E2E_TOKEN}&next=/chat`);
    const box = page.getByRole('textbox', { name: 'Message' });
    await box.fill(
      'Write a Markdown summary of consensus from Lectures 1–4, expanded with my notes',
    );
    await box.press('Enter');

    const open = page.getByRole('link', { name: 'Open note' });
    await expect(open).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/linked it to those notes/u)).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // The note is in the vault, written from both kinds of material and linked to mine.
    await open.click();
    await expectPageTitle(page, 'Summary of consensus', {
      timeout: 15_000,
    });
    await page.getByRole('radio', { name: 'Preview' }).click();
    await expect(page.getByRole('heading', { name: 'From the lectures' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'From my notes' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'My consensus notes' }).first()).toBeVisible();
  } finally {
    await stopServer(server);
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});
