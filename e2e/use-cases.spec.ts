import { type APIRequestContext, expect, test } from '@playwright/test';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { studyDay } from './days';
import { expectPageTitle } from './titles';

/**
 * Phase 21, task 21.01: the parts of the use cases in `product.md` §8 that no other spec walks through
 * end to end — a note's maths, code and diagram (UC-01), topics and a deadline that reaches Today
 * (UC-04), a mock exam whose answers move mastery (UC-07) and a backup made on request (UC-14). The
 * map of every use case to its specs is in the Phase 21 verification report (`docs/journal/`).
 */

const auth = { Authorization: `Bearer ${E2E_TOKEN}` };

async function create<T>(request: APIRequestContext, url: string, data: unknown): Promise<T> {
  const response = await request.post(url, { headers: auth, data });
  expect(response.status(), `${url}: ${await response.text()}`).toBeLessThan(300);
  return (await response.json()) as T;
}

test.beforeEach(async ({ page }) => {
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await expectPageTitle(page, 'Today');
});

test('UC-01: maths, code and a diagram read as they should in the preview', async ({
  page,
  request,
}) => {
  const note = await create<{ id: string }>(request, '/api/notes', {
    title: 'UC-01 Rendering',
    content: [
      '# Rendering',
      '',
      'Pythagoras: $a^2 + b^2 = c^2$, and a sum on a line of its own:',
      '',
      '$$',
      '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
      '$$',
      '',
      '```python',
      'def elect(term):',
      '    return term + 1',
      '```',
      '',
      '```mermaid',
      'graph LR',
      '  Follower --> Candidate --> Leader',
      '```',
      '',
    ].join('\n'),
  });
  await page.goto(`/notes/${note.id}`);
  await page.getByLabel('Preview', { exact: true }).click();
  await expect(page.locator('.katex').first()).toBeVisible();
  await expect(page.locator('.katex-display')).toHaveCount(1);
  await expect(page.locator('code.language-python .hljs-keyword').first()).toHaveText('def');
  const diagram = page.getByRole('img', { name: 'Diagram' });
  await expect(diagram.locator('svg')).toBeVisible({ timeout: 20_000 });
  await expect(diagram).toContainText('Candidate');
  expect(await seriousViolations(page)).toEqual([]);
});

test('UC-04: a module gets a topic, and its deadline reaches Today', async ({ page, request }) => {
  const module = await create<{ id: string }>(request, '/api/modules', {
    code: 'UC0401',
    title: 'Operating Systems',
  });
  await create(request, `/api/modules/${module.id}/assessments`, {
    title: 'Scheduler coursework',
    kind: 'coursework',
    weight: 0.4,
    dueAt: studyDay(3),
  });

  await page.goto(`/modules/${module.id}`);
  await page.getByRole('textbox', { name: 'New topic' }).fill('Scheduling');
  await page.getByRole('button', { name: 'Add topic' }).click();
  await expect(page.getByRole('list', { name: 'Topics' })).toContainText('Scheduling');

  await page.goto('/');
  const deadlines = page.getByRole('list', { name: 'Upcoming deadlines' });
  await expect(deadlines).toContainText('UC0401 Scheduler coursework');
});

test('UC-07: a mock exam is taken, marked, and moves the concept’s mastery', async ({
  page,
  request,
}) => {
  const module = await create<{ id: string }>(request, '/api/modules', {
    code: 'UC0701',
    title: 'Distributed Algorithms',
  });
  const concept = await create<{ id: string }>(request, '/api/concepts', {
    name: 'UC-07 Quorums',
    moduleIds: [module.id],
  });
  for (const [stem, right, wrong] of [
    ['What does a quorum guarantee?', 'Any two overlap', 'Every node agrees'],
    ['How many nodes make a quorum of five?', 'Three', 'Five'],
  ])
    await create(request, '/api/questions', {
      stem,
      answer: {
        kind: 'mcq',
        options: [
          { id: 'a', text: right, correct: true },
          { id: 'b', text: wrong, correct: false },
        ],
      },
      conceptIds: [concept.id],
      moduleId: module.id,
    });

  await page.goto('/practice');
  await page.getByRole('button', { name: 'New mock exam' }).click();
  const builder = page.getByRole('dialog', { name: 'New mock exam' });
  await builder
    .getByLabel('Module', { exact: true })
    .selectOption({ label: 'UC0701 — Distributed Algorithms' });
  await expect(builder.getByText('2 questions match')).toBeVisible();
  await builder.getByRole('button', { name: 'Start' }).click();

  // Every question on one page; no feedback until the end.
  await page.getByRole('radio', { name: 'Any two overlap' }).check();
  await page.getByRole('radio', { name: 'Five' }).check();
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole('button', { name: 'Submit' }).click();
  const confirm = page.getByRole('dialog', { name: 'Submit the mock exam?' });
  await expect(confirm).toContainText('Every question has an answer.');
  await confirm.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByTestId('attempt-score')).toHaveText('50 %');

  // One right and one wrong: the concept's mastery is a half, with the sum shown.
  await page.goto(`/concepts/${concept.id}`);
  const panel = page.getByRole('region', { name: 'Mastery' });
  await expect(panel.getByTestId('concept-mastery')).toHaveText('0.50');
  await expect(
    panel.getByText('questions 50 % over 2.0 weighted answers', { exact: false }),
  ).toBeVisible();
});

test('UC-14: a backup of the database is made on request and listed', async ({ page }) => {
  await page.goto('/settings');
  const panel = page.getByRole('region', { name: 'Database backups' });
  await panel.getByRole('button', { name: 'Back up now' }).click();
  await expect(panel.getByText('manual').first()).toBeVisible({ timeout: 15_000 });
  await expect(panel).toContainText(/skb-\d{8}-\d{6}-manual/u);
});
