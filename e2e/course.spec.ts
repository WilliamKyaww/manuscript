import { expect, type Page, test } from '@playwright/test';
import { makePdf } from '../apps/server/test/fixtures/sources/builders';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { expectPageTitle } from './titles';

/**
 * Task 6.15: create a module → a lecture → attach a source → create a concept from an unresolved
 * link → an assessment and the calculator. Names are unique to this file.
 */

const auth = { Authorization: `Bearer ${E2E_TOKEN}` };

test.beforeEach(async ({ page }) => {
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await expectPageTitle(page, 'Today');
});

async function createNote(page: Page, title: string, content: string) {
  const response = await page.request.post('/api/notes', {
    headers: auth,
    data: { title, content },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { id: string };
}

test('a module with a lecture, its material, a concept and the mark calculator', async ({
  page,
}) => {
  // Module.
  await page.goto('/modules');
  // The header's button: an empty Modules page offers a second one in its empty state.
  await page.locator('[data-page-header]').getByRole('button', { name: 'New module' }).click();
  const moduleDialog = page.getByRole('dialog', { name: 'New module' });
  await moduleDialog.getByLabel('Code').fill('E2E201');
  await moduleDialog.getByLabel('Title').fill('Gossip Systems');
  await moduleDialog.getByLabel('Credits').fill('20');
  await moduleDialog.getByLabel('Target mark (%)').fill('70');
  await moduleDialog.getByRole('button', { name: 'Create module' }).click();
  await page.getByRole('link', { name: /E2E201/ }).click();
  await expectPageTitle(page, 'E2E201 Gossip Systems');

  // Assessments and the calculator: 40 % marked 70, then a 60 % exam.
  for (const [title, kind, weight, mark] of [
    ['Coursework', 'coursework', '40', '70'],
    ['Exam', 'exam', '60', ''],
  ] as const) {
    await page.getByRole('button', { name: 'Add assessment' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add assessment' });
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel('Kind').selectOption(kind);
    await dialog.getByLabel('Weight (%)').fill(weight);
    if (mark) await dialog.getByLabel('Mark (%)').fill(mark);
    await dialog.getByRole('button', { name: 'Add assessment' }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(
    page.getByText('Needs an average of 70 % on the remaining 60 % for 70 %.'),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Mark for Exam (%)' }).fill('82');
  await page.getByRole('textbox', { name: 'Mark for Exam (%)' }).press('Enter');
  await expect(page.getByText('70 % is already secured.')).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  // The page header stays put while the module page scrolls (ui.md §2).
  const header = page.locator('[data-page-header]');
  const headerBefore = await header.boundingBox();
  await page.locator('[data-page-body]').evaluate((element) => {
    const filler = document.createElement('div');
    filler.style.height = '3000px';
    element.firstElementChild?.appendChild(filler);
    element.scrollTop = element.scrollHeight;
  });
  expect((await header.boundingBox())?.y).toBe(headerBefore?.y);
  await page.reload();

  // Lecture with an imported source attached.
  const form = {
    file: {
      name: 'Gossip lecture.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(makePdf([['Epidemic gossip spreads rumours.']])),
    },
    module: 'E2E201',
  };
  const upload = await page.request.post('/api/sources', { headers: auth, multipart: form });
  expect(upload.status()).toBe(201);
  await page.getByRole('button', { name: 'Add lecture' }).click();
  const lectureDialog = page.getByRole('dialog', { name: 'New lecture' });
  await expect(lectureDialog.getByLabel('Key')).toHaveValue('L01');
  await lectureDialog.getByLabel('Title').fill('Epidemic protocols');
  await lectureDialog.getByRole('button', { name: 'Add lecture' }).click();
  await page.getByRole('link', { name: /Epidemic protocols/ }).click();
  await expectPageTitle(page, 'L01 Epidemic protocols');
  await page
    .getByRole('combobox', { name: 'Source to attach' })
    .selectOption({ label: 'E2E201 · Gossip lecture' });
  await page.getByRole('button', { name: 'Attach' }).first().click();
  await expect(
    page
      .getByRole('list', { name: 'Lecture sources' })
      .getByRole('link', { name: 'Gossip lecture' }),
  ).toBeVisible();

  // A note attached to the lecture, whose unresolved link becomes a concept.
  await createNote(page, 'Gossip reading', '# Gossip reading\nRead about [[Anti-entropy]] first.');
  await page.getByRole('combobox', { name: 'Existing note to attach' }).fill('Gossip reading');
  await page.getByRole('button', { name: 'Attach' }).nth(1).click();
  const notes = page.getByRole('list', { name: 'Lecture notes' });
  await notes.getByRole('link', { name: 'Gossip reading' }).click();
  await page.getByLabel('Preview', { exact: true }).click();
  await page.getByRole('button', { name: 'Anti-entropy' }).click();
  await page.getByRole('menuitem', { name: /Create concept/ }).click();
  const conceptDialog = page.getByRole('dialog', { name: 'New concept' });
  await expect(conceptDialog.getByLabel('Name')).toHaveValue('Anti-entropy');
  await conceptDialog.getByText('E2E201').click();
  await conceptDialog.getByRole('button', { name: 'Create concept' }).click();
  const conceptLink = page.getByRole('link', { name: 'Anti-entropy' });
  await expect(conceptLink).toHaveAttribute('href', /\/concepts\/con_/);
  await conceptLink.click();
  await expectPageTitle(page, 'Anti-entropy');
  await expect(
    page
      .getByRole('list', { name: 'Notes linking here' })
      .getByRole('link', { name: 'Gossip reading' }),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  // The module lists the concept (it was created with the module ticked).
  await page.getByRole('link', { name: 'E2E201' }).first().click();
  await expect(
    page.getByRole('list', { name: 'Module concepts' }).getByRole('link', { name: 'Anti-entropy' }),
  ).toBeVisible();
});
