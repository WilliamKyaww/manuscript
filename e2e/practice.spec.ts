import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { startServer, stopServer } from './server';

/**
 * Task 9.15: write questions → build a quiz → answer it (grading a written answer yourself) →
 * the concept's mastery and its explanation follow; then a Learn session asks the next question.
 * On a server of its own, so the bank, quizzes and mastery are this test's alone.
 */

/** Not the shared server's 4399, nor the restart tests' 4398 and 4397. */
const PORT = 4396;
const origin = `http://127.0.0.1:${PORT}`;
const auth = { Authorization: `Bearer ${E2E_TOKEN}` };

async function post(page: Page, url: string, data: unknown) {
  const response = await page.request.post(`${origin}${url}`, { headers: auth, data });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string };
}

/** The verdict on the answer just given (toasts are statuses too). */
const feedback = (page: Page) => page.getByRole('region', { name: 'Feedback' }).getByRole('status');

test('questions become a quiz whose answers move mastery, with the reasons shown', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(path.join(tmpdir(), 'skb-e2e-practice-'));
  const server = await startServer(dir, PORT);
  try {
    const module = await post(page, '/api/modules', { code: 'E2E301', title: 'Consensus' });
    const concept = await post(page, '/api/concepts', {
      name: 'Leader election',
      moduleIds: [module.id],
    });

    await page.goto(`${origin}/auth?token=${E2E_TOKEN}&next=/practice`);
    await expect(page.getByRole('heading', { name: 'No questions yet' })).toBeVisible();

    // A multiple-choice question (the first option is right by default) and one to explain.
    await page.getByRole('button', { name: 'Write a question' }).click();
    let editor = page.getByRole('dialog', { name: 'New question' });
    await editor.getByLabel('Question').fill('What does Raft elect in each term?');
    await editor.getByRole('textbox', { name: 'Option 1', exact: true }).fill('A leader');
    await editor.getByRole('textbox', { name: 'Option 2', exact: true }).fill('A quorum');
    await editor.getByLabel('Why option 2 is wrong').fill('A quorum votes; it does not lead.');
    await editor.getByRole('combobox', { name: 'Add a concept' }).fill('Leader election');
    await editor.getByRole('combobox', { name: 'Add a concept' }).press('Enter');
    await expect(
      editor.getByRole('button', { name: 'Remove concept Leader election' }),
    ).toBeVisible();
    await editor.getByRole('button', { name: 'Add question' }).click();
    await expect(editor).toBeHidden();

    await page.getByRole('button', { name: 'New question' }).click();
    editor = page.getByRole('dialog', { name: 'New question' });
    await editor.getByLabel('Kind').selectOption('explain');
    await editor.getByLabel('Question').fill('Why does Raft need a majority to elect a leader?');
    await editor
      .getByLabel('Model answer')
      .fill('Any two majorities overlap, so two leaders cannot win one term.');
    await editor.getByRole('combobox', { name: 'Add a concept' }).fill('Leader election');
    await editor.getByRole('combobox', { name: 'Add a concept' }).press('Enter');
    await editor.getByRole('button', { name: 'Add question' }).click();
    await expect(editor).toBeHidden();
    expect(await seriousViolations(page)).toEqual([]);

    // A practice quiz of both, answered: the choice right, the explanation graded "Partly".
    await page.getByRole('button', { name: 'New quiz' }).click();
    const builder = page.getByRole('dialog', { name: 'New practice quiz' });
    await expect(builder.getByText('2 questions match')).toBeVisible();
    await builder.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByText('Question 1 of 2')).toBeVisible();
    for (let index = 0; index < 2; index += 1) {
      const choice = page.getByRole('radio', { name: /A leader/ });
      if (await choice.isVisible()) {
        await choice.check();
        await page.getByRole('button', { name: /^Check/ }).click();
        await expect(feedback(page)).toHaveText('Right');
        await expect(page.getByText('A quorum votes; it does not lead.')).toBeVisible();
      } else {
        await page.getByRole('textbox', { name: 'Your answer' }).fill('Majorities overlap.');
        await page.getByRole('button', { name: /^Check/ }).click();
        await expect(feedback(page)).toHaveText('Waiting for your grade');
        expect(await seriousViolations(page)).toEqual([]);
        await page.getByRole('button', { name: 'Partly' }).click();
        await expect(feedback(page)).toHaveText('Partly right (50 %)');
      }
      await page.getByRole('button', { name: index === 0 ? /Next question/ : /Finish/ }).click();
    }
    await expect(page.getByTestId('attempt-score')).toHaveText('75 %');

    // Mastery from the two answers: (1 + 0.5) / 2, weighted 1.5 each.
    await page.goto(`${origin}/concepts/${concept.id}`);
    const panel = page.getByRole('region', { name: 'Mastery' });
    await expect(panel.getByTestId('concept-mastery')).toHaveText('0.75');
    await expect(panel.getByText('Practised', { exact: true })).toBeVisible();
    await expect(
      panel.getByText('questions 75 % over 2.0 weighted answers', { exact: false }),
    ).toBeVisible();
    await expect(
      panel.getByText('mastery = (0.00 × 0 + 1.5 × 0.75 × 2.00) / (0 + 1.5 × 2.00) = 0.75'),
    ).toBeVisible();

    await page.goto(`${origin}/progress`);
    const concepts = page.getByRole('list', { name: 'Concepts in E2E301' });
    await expect(concepts.getByText('Leader election')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    // Learn: the concept is practised, so the engine starts it one rung up and takes the nearest
    // rung with material — the multiple-choice question.
    await page.goto(`${origin}/practice`);
    await page.getByRole('button', { name: 'Start Learn' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Learn' })).toBeVisible();
    await page.getByRole('radio', { name: /A leader/ }).check();
    await page.getByRole('button', { name: /^Check/ }).click();
    await expect(feedback(page)).toHaveText('Right');
    await page.getByRole('button', { name: /Continue/ }).click();
    await expect(page.getByText('Explain', { exact: true }).first()).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByRole('button', { name: 'End session' }).click();
    await expect(page.getByTestId('attempt-score')).toHaveText('100 %');
  } finally {
    await stopServer(server);
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
});
