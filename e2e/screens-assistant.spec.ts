import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { makePptx } from '../apps/server/test/fixtures/sources/builders';
import { E2E_TOKEN } from './constants';
import { startServer, stopServer } from './server';

/**
 * Screenshots of the assistant (Phase 20, tasks 20.16 and 20.17), the companion of `screens.spec.ts`:
 * a chat's activity and result card, the drafts it made in the Inbox, and an approval card. Runs only
 * when asked, like that file: SKB_SCREENSHOTS=<folder> npx playwright test e2e/screens-assistant.spec.ts
 */

const target = process.env.SKB_SCREENSHOTS;
const width = Number(process.env.SKB_SCREENSHOT_WIDTH ?? 1440);
const auth = { Authorization: `Bearer ${E2E_TOKEN}` };
/** The next free own-server port (AGENTS.md §5). */
const AI_PORT = 4387;

test.skip(!target, 'Set SKB_SCREENSHOTS=<folder> to take screenshots.');

/**
 * The assistant's screens need a model: a server of this test's own with the built-in test model
 * (SKB_AI_PROVIDER=mock), its own port and throwaway folders, as in `chat.spec.ts`.
 */
test('the assistant in both themes: activity, a result, drafts and an approval', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const origin = `http://127.0.0.1:${AI_PORT}`;
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-screens-'));
  const server = await startServer(dir, AI_PORT, { SKB_AI_PROVIDER: 'mock' });
  const folder = path.resolve(target ?? '.');
  const both = async (name: string) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(folder, `${name}-${scheme}.png`) });
    }
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  };
  try {
    mkdirSync(folder, { recursive: true });
    await page.setViewportSize({ width, height: Math.round((width * 9) / 16) });
    const imported = await page.request.post(`${origin}/api/sources`, {
      headers: auth,
      multipart: {
        file: {
          name: 'Consensus.pptx',
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          buffer: Buffer.from(
            makePptx([
              { title: 'Two-phase commit', body: ['An atomic commitment protocol.'] },
              { title: 'The coordinator', body: ['It collects a vote from every participant.'] },
              { title: 'Blocking', body: ['A participant blocks if the coordinator fails.'] },
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
            ).json()) as { status: string }
          ).status,
        { timeout: 30_000 },
      )
      .toBe('ready');
    const module = await page.request.post(`${origin}/api/modules`, {
      headers: auth,
      data: { code: 'COC251', title: 'Distributed Systems' },
    });
    const moduleId = ((await module.json()) as { id: string }).id;
    for (const key of ['L1', 'L2', 'L3']) {
      const lecture = await page.request.post(`${origin}/api/modules/${moduleId}/lectures`, {
        headers: auth,
        data: { key, title: `Lecture ${key}` },
      });
      const lectureId = ((await lecture.json()) as { id: string }).id;
      await page.request.post(`${origin}/api/lectures/${lectureId}/sources`, {
        headers: auth,
        data: { sourceId },
      });
    }
    await page.request.post(`${origin}/api/notes`, {
      headers: auth,
      data: { title: 'Scratch', content: 'Throw-away thoughts.' },
    });

    await page.goto(`${origin}/auth?token=${E2E_TOKEN}&next=/chat`);
    const box = page.getByRole('textbox', { name: 'Message' });
    await box.fill('Create flashcards from lectures 1–3');
    await box.press('Enter');
    await expect(page.getByRole('link', { name: 'Review in the Inbox' })).toBeVisible({
      timeout: 60_000,
    });
    await both('chat-result');

    await page.getByRole('link', { name: 'Review in the Inbox' }).click();
    await expect(page.locator('[data-draft]').first()).toBeVisible();
    await both('inbox-drafts');

    await page.goto(`${origin}/chat`);
    await box.fill('Please delete the note Scratch');
    await box.press('Enter');
    await expect(page.getByRole('listitem', { name: /^Approval needed: / })).toBeVisible({
      timeout: 30_000,
    });
    await both('chat-approval');
  } finally {
    await stopServer(server);
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});
