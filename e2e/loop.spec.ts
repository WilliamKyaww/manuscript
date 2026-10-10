import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { makePptx } from '../apps/server/test/fixtures/sources/builders';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { studyDay } from './days';
import { startServer, stopServer } from './server';

/**
 * Task 15.09: the study loop with the built-in test model (SKB_AI_PROVIDER=mock). A lecture's slides
 * become suggestions and drafts in one request; accepting the concepts lets the cards know them;
 * reviewing a card gives its concept a mastery; Progress shows it and the plan has something to say
 * about it; a wrong answer is offered back to the concept's note; and the graph can be coloured by
 * mastery and shows what joins the modules.
 */

/** Not the shared server's 4399, nor the other own-server tests' 4398–4390. */
const PORT = 4389;
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
];

async function post<T>(request: APIRequestContext, url: string, data: unknown): Promise<T> {
  const response = await request.post(`${origin}${url}`, { headers: auth, data });
  expect(response.status(), `${url}: ${await response.text()}`).toBeLessThan(300);
  return (await response.json()) as T;
}

const day = studyDay;

test('a lecture becomes concepts, cards, mastery and a plan', async ({ page }) => {
  test.setTimeout(180_000);
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-loop-'));
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
    const module = await post<{ id: string }>(page.request, '/api/modules', {
      code: 'CS301',
      title: 'Distributed Systems',
      credits: 15,
    });
    await post(page.request, `/api/modules/${module.id}/assessments`, {
      title: 'Exam',
      kind: 'exam',
      weight: 1,
      dueAt: day(9),
    });
    const lecture = await post<{ id: string }>(page.request, `/api/modules/${module.id}/lectures`, {
      key: 'L3',
      title: 'Commit protocols',
      heldOn: day(1),
    });
    await post(page.request, `/api/lectures/${lecture.id}/sources`, { sourceId });

    // 1. One request makes the study materials.
    await page.goto(`${origin}/auth?token=${E2E_TOKEN}&next=/lectures/${lecture.id}`);
    await expect(
      page.getByRole('heading', { level: 1, name: /L3 Commit protocols/u }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Make study materials…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Make study materials' });
    expect(await seriousViolations(page)).toEqual([]);
    await dialog.getByRole('button', { name: 'Make them' }).click();
    const steps = page.getByRole('list', { name: 'Pipeline steps' });
    await expect(steps.getByText('A quiz of those questions')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open the Inbox' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/5 of 5 steps made something/u)).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // 2. Nothing is saved until it is accepted: concepts first, so that cards can know them.
    await page.getByRole('link', { name: 'Open the Inbox' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible();
    await page.getByRole('tab', { name: /Suggestions/u }).click();
    await page.getByRole('checkbox', { name: 'Select all' }).check();
    await page.getByRole('button', { name: 'Accept selected' }).click();
    await expect(page.getByText('No suggestions waiting')).toBeVisible({ timeout: 15_000 });

    // 3. Making the cards again, now that the concepts exist, links them.
    await page.goto(`${origin}/lectures/${lecture.id}`);
    await page.getByRole('button', { name: 'Make them again…' }).click();
    const again = page.getByRole('dialog', { name: 'Make study materials' });
    for (const label of [
      'A summary note',
      'Concepts and links',
      'Questions',
      'A quiz of those questions',
    ])
      await again.getByRole('checkbox', { name: label, exact: true }).uncheck();
    await again.getByRole('button', { name: 'Make them' }).click();
    await expect(page.getByText(/1 of 1 steps made something/u)).toBeVisible({ timeout: 60_000 });
    await page.getByRole('link', { name: 'Open the Inbox' }).click();
    await page.getByRole('tab', { name: /Drafts/u }).click();
    const drafts = page.locator('[data-draft]');
    await expect(drafts.first()).toBeVisible();
    // Accept the cards that know a concept.
    const answerBefore = await page.request.get(`${origin}/api/drafts`, { headers: auth });
    const body = (await answerBefore.json()) as {
      cards: { id: string; concepts: unknown[] }[];
    };
    const linked = body.cards.filter((card) => card.concepts.length > 0).map((card) => card.id);
    expect(linked.length).toBeGreaterThan(0);
    await post(page.request, '/api/drafts/accept', { cardIds: linked });

    // 4. Reviewing a card gives its concept a mastery that Progress shows.
    const queue = (await (
      await page.request.get(`${origin}/api/review/queue`, { headers: auth })
    ).json()) as { items: { cardId: string; ordinal: number }[] };
    const first = queue.items[0];
    expect(first).toBeDefined();
    await post(page.request, '/api/reviews', {
      cardId: first?.cardId,
      ordinal: first?.ordinal,
      rating: 3,
      durationMs: 3_000,
    });
    await page.goto(`${origin}/progress`);
    await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
    // A concept row now shows a mastery figure (its explanation is one click away).
    const figure = page.locator('summary').filter({ hasText: /\d\.\d\d/u });
    await expect(figure.first()).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // 5. The plan has a review to do and concepts to practise, each with its reason.
    await page.goto(`${origin}/plan`);
    await page.getByRole('button', { name: 'Make a plan' }).first().click();
    await expect(page.locator('[data-plan-item]').first()).toBeVisible();
    await expect(page.getByText(/card is due now|cards are due now/u).first()).toBeVisible();
    await expect(page.getByText(/Practise /u).first()).toBeVisible();

    // 6. Before the lecture tomorrow, Today brings up what is weakest in the module.
    await page.goto(`${origin}/`);
    const next = page.getByRole('list', { name: 'Before what’s next' });
    await expect(next.getByText('tomorrow')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // 7. The graph can be coloured by mastery, and says what each shape means.
    await page.goto(`${origin}/graph`);
    await page.getByRole('combobox', { name: 'Colour by' }).selectOption('mastery');
    await expect(page.getByRole('list', { name: 'Mastery' })).toBeVisible();
    await page.getByRole('button', { name: 'Between modules' }).click();
    // One module so far, so there is nothing yet to cross: the panel says so rather than staying blank.
    await expect(
      page.getByRole('heading', { name: 'No connections between modules yet' }),
    ).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  } finally {
    await stopServer(server);
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});
