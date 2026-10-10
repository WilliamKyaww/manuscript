import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { startServer, stopServer } from './server';

/**
 * Tasks 14.12 and 14.01–14.02: a 7-day plan is made from a module with a deadline, an exam and a
 * concept to practise; items are ticked off and skipped; making the plan again keeps them. And a
 * tutored conversation (the built-in test model, SKB_AI_PROVIDER=mock) opens with a question rather
 * than a solution, and asks before recording the student's answer to a quiz question.
 */

/** Not the shared server's 4399, nor the other own-server tests' 4398–4392. */
const PORTS = { plan: 4391, tutor: 4390 };
const auth = { Authorization: `Bearer ${E2E_TOKEN}` };

const pad = (value: number) => String(value).padStart(2, '0');
const inDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

async function post<T>(
  request: import('@playwright/test').APIRequestContext,
  origin: string,
  url: string,
  data: unknown,
): Promise<T> {
  const response = await request.post(`${origin}${url}`, { headers: auth, data });
  expect(response.status(), `${url}: ${await response.text()}`).toBeLessThan(300);
  return (await response.json()) as T;
}

const MCQ = (stem: string, conceptIds: string[]) => ({
  stem,
  answer: {
    kind: 'mcq',
    options: [
      { id: 'a', text: 'A leader', correct: true },
      { id: 'b', text: 'A quorum', correct: false },
    ],
  },
  conceptIds,
});

test('a 7-day plan explains itself, and planning again keeps what was done', async ({ page }) => {
  test.setTimeout(120_000);
  const origin = `http://127.0.0.1:${PORTS.plan}`;
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-plan-'));
  const server = await startServer(dir, PORTS.plan);
  try {
    const module = await post<{ id: string }>(page.request, origin, '/api/modules', {
      code: 'CS301',
      title: 'Distributed Systems',
      credits: 15,
    });
    await post(page.request, origin, `/api/modules/${module.id}/assessments`, {
      title: 'Coursework 1',
      kind: 'coursework',
      weight: 0.3,
      dueAt: inDays(5),
      remainingHours: 3,
    });
    await post(page.request, origin, `/api/modules/${module.id}/assessments`, {
      title: 'Exam',
      kind: 'exam',
      weight: 0.7,
      dueAt: inDays(12),
      durationMinutes: 60,
    });
    const concept = await post<{ id: string }>(page.request, origin, '/api/concepts', {
      name: 'Raft log matching',
      moduleIds: [module.id],
    });
    await post(page.request, origin, '/api/questions', MCQ('What does Raft elect?', [concept.id]));
    await post(page.request, origin, `/api/modules/${module.id}/lectures`, {
      key: 'L1',
      title: 'Consensus',
    });

    await page.goto(`${origin}/auth?token=${E2E_TOKEN}&next=/plan`);
    await expect(page.getByRole('heading', { level: 1, name: 'Plan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'No plan yet' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await page.getByRole('button', { name: 'Make a plan' }).first().click();
    const items = page.locator('[data-plan-item]');
    await expect(items.first()).toBeVisible();
    // Coursework before its deadline, practice on the concept, each with a reason.
    await expect(
      page.getByText(/3 h left, due in 5 days \(30 % of CS301\)/u).first(),
    ).toBeVisible();
    await expect(page.getByText(/Practise Raft log matching/u).first()).toBeVisible();
    await expect(page.getByText(/Not practised yet, .*of CS301/u).first()).toBeVisible();
    const count = await items.count();
    expect(count).toBeGreaterThan(3);
    expect(await seriousViolations(page)).toEqual([]);

    // Tick one off and skip another.
    const first = page.locator('[data-plan-item][data-status="planned"]').first();
    const doneTitle = (await first.locator('p').first().textContent()) ?? '';
    await first.getByRole('button', { name: /^Mark done/u }).click();
    await expect(page.locator('[data-plan-item][data-status="done"]')).toHaveCount(1);
    await page
      .locator('[data-plan-item][data-status="planned"]')
      .nth(1)
      .getByRole('button', { name: /Skip/u })
      .click();
    await expect(page.locator('[data-plan-item][data-status="skipped"]')).toHaveCount(1);
    await expect(page.getByText(/· 1 done/u)).toBeVisible();

    // Today shows today's items.
    await page.goto(`${origin}/`);
    const today = page.getByRole('list', { name: 'Today’s plan' });
    await expect(today.getByText(doneTitle).first()).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // Planning again keeps the done and skipped items.
    await page.goto(`${origin}/plan`);
    await page.getByRole('button', { name: 'Plan again' }).click();
    await expect(page.locator('[data-plan-item][data-status="done"]')).toHaveCount(1);
    await expect(page.locator('[data-plan-item][data-status="skipped"]')).toHaveCount(1);
    await expect(
      page.locator('[data-plan-item][data-status="done"]').getByText(doneTitle),
    ).toBeVisible();

    // The list view reads the same plan, and availability is a setting away.
    await page.getByRole('radio', { name: 'List' }).check({ force: true });
    await expect(page.getByRole('list', { name: 'Plan' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.goto(`${origin}/settings`);
    const form = page.getByRole('form', { name: 'Study plan settings' });
    await expect(form.getByLabel('Monday')).toHaveValue('90');
    expect(await seriousViolations(page)).toEqual([]);
  } finally {
    await stopServer(server);
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});

test('a tutor asks before it explains, and asks before recording an answer', async ({ page }) => {
  test.setTimeout(120_000);
  const origin = `http://127.0.0.1:${PORTS.tutor}`;
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-tutor-'));
  const server = await startServer(dir, PORTS.tutor, { SKB_AI_PROVIDER: 'mock' });
  try {
    const module = await post<{ id: string }>(page.request, origin, '/api/modules', {
      code: 'CS301',
      title: 'Distributed Systems',
    });
    const concept = await post<{ id: string }>(page.request, origin, '/api/concepts', {
      name: 'Raft',
      moduleIds: [module.id],
    });
    await post(page.request, origin, '/api/questions', MCQ('What does Raft elect?', [concept.id]));

    await page.goto(`${origin}/auth?token=${E2E_TOKEN}&next=/chat`);
    await page.getByRole('combobox', { name: 'Mode' }).selectOption('tutor');
    const box = page.getByRole('textbox', { name: 'Message' });
    await box.fill('How does Raft elect a leader?');
    await box.press('Enter');
    const first = page.getByRole('article', { name: 'Assistant' }).first();
    await expect(first).toContainText('Before I explain anything');
    await expect(first).not.toContainText('worked solution');

    // Asking for the solution is what gets it, and it ends with a question for the student.
    await box.fill('Please show me the full solution');
    await box.press('Enter');
    await expect(page.getByText(/Check question:/u)).toBeVisible({ timeout: 30_000 });

    // A quiz from the student's own bank: the answer is recorded only once they approve it.
    await box.fill('Quiz me on Raft');
    await box.press('Enter');
    await expect(page.getByText('Question: What does Raft elect?')).toBeVisible({
      timeout: 30_000,
    });
    await box.fill('A');
    await box.press('Enter');
    const card = page.getByRole('listitem', { name: /^Approval needed: Record your answer/u });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('recorded permanently');
    await expect(card.getByRole('button', { name: 'Approve for this chat' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await card.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByText(/Correct\. The answer is: A leader/u)).toBeVisible({
      timeout: 30_000,
    });
    // It counts, as assisted evidence, towards the concept's mastery.
    const detail = await page.request.get(`${origin}/api/mastery/concepts/${concept.id}`, {
      headers: auth,
    });
    const body = (await detail.json()) as { answers: { score: number; assisted: boolean }[] };
    expect(body.answers).toEqual([expect.objectContaining({ score: 1, assisted: true })]);
  } finally {
    await stopServer(server);
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});
