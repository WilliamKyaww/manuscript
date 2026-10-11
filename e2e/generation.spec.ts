import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { makePptx } from '../apps/server/test/fixtures/sources/builders';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { startServer, stopServer } from './server';

/**
 * Task 11.15: with the built-in test model (SKB_AI_PROVIDER=mock), flashcards generated from the
 * first three slides of a lecture wait in the Inbox as drafts, each pointing at its slide; once
 * accepted they are studied like any other card.
 */

/** Not the shared server's 4399, nor the other own-server tests' 4398–4395. */
const PORT = 4394;
const origin = `http://127.0.0.1:${PORT}`;
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
  { title: 'Paxos', body: ['Paxos is a consensus protocol built on numbered ballots.'] },
];

test('flashcards from the first three slides are reviewed, accepted and studied', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-generate-'));
  const server = await startServer(dir, PORT, { SKB_AI_PROVIDER: 'mock' });
  try {
    const imported = await page.request.post(`${origin}/api/sources`, {
      headers: auth,
      multipart: {
        file: {
          name: 'Commit protocols.pptx',
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
              await page.request.get(`${origin}/api/sources/${sourceId}`, { headers: auth })
            ).json()) as { status: string }
          ).status,
        { timeout: 30_000 },
      )
      .toBe('ready');

    // Generate from slides 1–3 of the source.
    await page.goto(`${origin}/auth?token=${E2E_TOKEN}&next=/library/${sourceId}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Commit protocols' })).toBeVisible();
    await page.getByRole('button', { name: 'Generate…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Generate with AI' });
    await expect(dialog.getByRole('radio', { name: 'Flashcards' })).toBeChecked();
    await dialog.getByLabel('From page or slide').fill('1');
    await dialog.getByLabel('To', { exact: true }).fill('3');
    await expect(dialog.getByText(/^3 passages · about/u)).toBeVisible();
    await expect(dialog.getByText('Test model (mock)')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(dialog.getByText('3 cards ready to review in the Inbox.')).toBeVisible({
      timeout: 30_000,
    });
    await dialog.getByRole('link', { name: 'Open Inbox' }).click();

    // Three drafts, each from one of the first three slides.
    await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
    const drafts = page.locator('[data-draft]');
    await expect(drafts).toHaveCount(3);
    for (const [index, slide] of [1, 2, 3].entries())
      await expect(drafts.nth(index).getByRole('link', { name: `Slide ${slide}` })).toHaveAttribute(
        'href',
        `/library/${sourceId}?slide=${slide}`,
      );
    await expect(drafts.first()).toContainText('What is Two-phase commit?');
    // The sidebar (collapsed, as it starts) says how many wait in the Inbox link's name.
    await expect(
      page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: /^Inbox\s*, 3 waiting$/u }),
    ).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // Accept two, reject one.
    await drafts.nth(0).getByRole('checkbox').check();
    await drafts.nth(1).getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Accept selected' }).click();
    await expect(drafts).toHaveCount(1);
    await drafts
      .first()
      .getByRole('button', { name: /^Reject/u })
      .click();
    await expect(page.getByText('No drafts waiting')).toBeVisible();

    // Study them.
    await page.goto(`${origin}/review`);
    await page.locator('[data-page-header] a[href^="/review/session"]').click();
    const question = page.getByRole('region', { name: 'Question' });
    await expect(question).toContainText('What is Two-phase commit?');
    await page.keyboard.press('Space');
    await expect(page.getByRole('region', { name: 'Answer' })).toContainText(
      'an atomic commitment protocol',
    );
    await page.keyboard.press('3');
    await expect(question).toContainText('What is The coordinator?');
  } finally {
    await stopServer(server);
    rmSync(dir, { recursive: true, force: true });
  }
});
