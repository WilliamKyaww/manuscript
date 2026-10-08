import { expect, type Page, test } from '@playwright/test';
import { makePdf, makePptx } from '../apps/server/test/fixtures/sources/builders';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';

/**
 * Task 5.19: import a PDF and a PPTX → both become ready → search finds their text → a result
 * opens the right page or slide. Words are unique to this file, so other tests' data cannot match.
 */

const PDF_WORD = 'xylophonequorum';
const NOTES_WORD = 'marimbacoordinator';
const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

test.beforeEach(async ({ page }) => {
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
});

async function importLectureFiles(page: Page) {
  await page.goto('/library');
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page.getByRole('combobox', { name: /Module for new imports/ }).fill('E2E101');
  await page.locator('input[type="file"]').setInputFiles([
    {
      name: 'Lecture 7.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(
        makePdf([
          ['Lecture 7: Agreement', 'An introduction.'],
          ['Background reading for the week.'],
          [`The ${PDF_WORD} rule needs a majority of replicas.`],
          ['Summary and questions.'],
        ]),
      ),
    },
    {
      name: 'Week 7.pptx',
      mimeType: PPTX_TYPE,
      buffer: Buffer.from(
        makePptx([
          { title: 'Week 7', body: ['Agreement protocols'] },
          {
            title: 'Two-phase commit',
            body: ['Prepare', 'Commit'],
            notes: `Stress that the ${NOTES_WORD} can block everyone.`,
          },
        ]),
      ),
    },
  ]);
  const list = page.getByRole('list', { name: 'Sources in E2E101' });
  await expect(list.getByRole('listitem')).toHaveCount(2);
  await expect(list.getByText('Ready', { exact: true })).toHaveCount(2, { timeout: 30_000 });
  return list;
}

test('imported sources are searchable and results open at the page or slide', async ({ page }) => {
  const list = await importLectureFiles(page);
  await expect(list.getByText(/PDF · 4 pages/)).toBeVisible();
  await expect(list.getByText(/Slides · 2 slides/)).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  // A PDF hit opens page 3, rendered with selectable text.
  await page.goto(`/search?q=${PDF_WORD}`);
  const results = page.getByRole('list', { name: 'Search results' });
  await results.getByRole('link', { name: /Lecture 7 › p\. 3/ }).click();
  await expect(page).toHaveURL(/\/library\/src_[0-9A-Z]+\?page=3$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Lecture 7' })).toBeVisible();
  const page3 = page.locator(
    '[data-pane-body] section[aria-label="Page 3"] [data-page-number="3"]',
  );
  await expect(page3.locator('.textLayer')).toContainText(PDF_WORD, { timeout: 15_000 });
  await expect(page3).toBeInViewport();
  await expect(page.getByRole('textbox', { name: 'Page number' })).toHaveValue('3');

  // The page and pane headers stay put while the pages scroll (ui.md §2).
  const header = page.locator('[data-page-header]');
  const headerBefore = await header.boundingBox();
  const pagesPane = page
    .locator('[data-pane]')
    .filter({ has: page.locator('section[aria-label="Page 1"]') });
  const paneHeader = pagesPane.locator('[data-pane-header]');
  const paneHeaderBefore = await paneHeader.boundingBox();
  await pagesPane.locator('[data-pane-body]').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect((await header.boundingBox())?.y).toBe(headerBefore?.y);
  expect((await paneHeader.boundingBox())?.y).toBe(paneHeaderBefore?.y);
  expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);

  // A hit in speaker notes opens the slide with its notes in view.
  await page.goto(`/search?q=${NOTES_WORD}`);
  await page
    .getByRole('list', { name: 'Search results' })
    .getByRole('link', { name: /Week 7 › Slide 2/ })
    .click();
  await expect(page).toHaveURL(/slide=2&notes=true/);
  const notes = page.getByRole('complementary', { name: 'Speaker notes for slide 2' });
  await expect(notes).toContainText(NOTES_WORD);
  await expect(notes).toBeInViewport();
  expect(await seriousViolations(page)).toEqual([]);
});

test('unsupported files are refused with a reason and nothing is imported', async ({ page }) => {
  await page.goto('/library');
  await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'setup.exe',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('MZ\x90\x00'),
  });
  await expect(page.getByText('A file was not imported')).toBeVisible();
  await expect(page.getByText(/setup\.exe: \.exe files cannot be imported/)).toBeVisible();
});
