import { type APIRequestContext, expect, test } from '@playwright/test';
import { makePptx } from '../apps/server/test/fixtures/sources/builders';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';

/**
 * Task 17.09: the screens that have content, in both themes. The shell spec scans every route as it
 * is when nothing has been made; this one makes something of each kind and scans the pages that show
 * it — where contrast, labels and focus problems actually turn up.
 */

const auth = { Authorization: `Bearer ${E2E_TOKEN}` };

async function create<T>(request: APIRequestContext, url: string, data: unknown): Promise<T> {
  const response = await request.post(url, { headers: auth, data });
  expect(response.status(), `${url}: ${await response.text()}`).toBeLessThan(300);
  return (await response.json()) as T;
}

interface Seed {
  module: string;
  lecture: string;
  concept: string;
  note: string;
  source: string;
  cardSet: string;
}

let seed: Seed;
/** Names are unique to each run, so seeding again after a worker restart does not collide. */
const tag = String(Date.now()).slice(-6);
const names = {
  module: `AX${tag}`,
  concept: `Round robin ${tag}`,
  other: `Time quantum ${tag}`,
  note: `Scheduling notes ${tag}`,
  set: `OS terms ${tag}`,
};

test.beforeAll(async ({ request }) => {
  const module = await create<{ id: string }>(request, '/api/modules', {
    code: names.module,
    title: `Operating systems ${tag}`,
    credits: 15,
  });
  await create(request, `/api/modules/${module.id}/assessments`, {
    title: 'Exam',
    kind: 'exam',
    weight: 0.7,
    dueAt: '2027-01-20',
  });
  const lecture = await create<{ id: string }>(request, `/api/modules/${module.id}/lectures`, {
    key: 'L1',
    title: 'Scheduling',
  });
  const concept = await create<{ id: string }>(request, '/api/concepts', {
    name: names.concept,
    summary: 'Each process gets a turn of fixed length, in order.',
    moduleIds: [module.id],
  });
  const other = await create<{ id: string }>(request, '/api/concepts', {
    name: names.other,
    moduleIds: [module.id],
  });
  await create(request, '/api/relations', {
    from: other.id,
    to: concept.id,
    relation: 'part_of',
  });
  const note = await create<{ id: string }>(request, '/api/notes', {
    title: names.note,
    content: `# Scheduling\n\nSee [[${names.concept}]] and [[${names.other}]]. #os\n`,
  });
  const imported = await request.post('/api/sources', {
    headers: auth,
    multipart: {
      file: {
        name: 'Scheduling.pptx',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        buffer: Buffer.from(
          makePptx([
            { title: 'Round robin', body: ['Each process runs for one time quantum, then waits.'] },
            { title: 'Priorities', body: ['Higher priorities run first.'] },
          ]),
        ),
      },
      module: names.module,
    },
  });
  expect(imported.status()).toBeLessThan(300);
  const source = ((await imported.json()) as { source: { id: string } }).source;
  const cardSet = await create<{ id: string }>(request, '/api/card-sets', {
    title: names.set,
    moduleId: module.id,
  });
  await create(request, '/api/cards', {
    setId: cardSet.id,
    kind: 'basic',
    front: 'What is a time quantum?',
    back: 'The length of a turn in round robin scheduling.',
  });
  await create(request, '/api/questions', {
    stem: 'Which scheduler gives each process an equal turn?',
    answer: {
      kind: 'mcq',
      options: [
        { id: 'a', text: 'Round robin', correct: true },
        { id: 'b', text: 'Shortest job first', correct: false },
      ],
    },
    conceptIds: [concept.id],
  });
  seed = {
    module: module.id,
    lecture: lecture.id,
    concept: concept.id,
    note: note.id,
    source: source.id,
    cardSet: cardSet.id,
  };
});

const pages = (): { name: string; path: string; heading: RegExp | string }[] => [
  { name: 'search results', path: '/search?q=round', heading: 'Search' },
  { name: 'a note', path: `/notes/${seed.note}`, heading: names.note },
  { name: 'a module', path: `/modules/${seed.module}`, heading: new RegExp(names.module, 'u') },
  { name: 'a lecture', path: `/lectures/${seed.lecture}`, heading: /Scheduling/u },
  { name: 'a concept', path: `/concepts/${seed.concept}`, heading: names.concept },
  { name: 'a source', path: `/library/${seed.source}`, heading: /Scheduling/u },
  { name: 'a card set', path: `/review/sets/${seed.cardSet}`, heading: names.set },
  { name: 'the question bank', path: '/practice/questions', heading: 'Question bank' },
  { name: 'the graph', path: '/graph', heading: 'Graph' },
  { name: 'progress', path: '/progress', heading: 'Progress' },
  { name: 'settings with its data panels', path: '/settings', heading: 'Settings' },
  { name: 'diagnostics', path: '/diagnostics', heading: 'Diagnostics' },
];

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(`/auth?token=${E2E_TOKEN}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    });

    for (const item of ['search results', 'a note', 'a module', 'a lecture', 'a concept']) {
      test(`${item} has no serious violations`, async ({ page }) => {
        const target = pages().find((entry) => entry.name === item);
        if (!target) throw new Error(`no such page: ${item}`);
        await page.goto(target.path);
        await expect(page.getByRole('heading', { level: 1, name: target.heading })).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
        expect(await seriousViolations(page)).toEqual([]);
      });
    }

    for (const item of [
      'a source',
      'a card set',
      'the question bank',
      'the graph',
      'progress',
      'settings with its data panels',
      'diagnostics',
    ]) {
      test(`${item} has no serious violations`, async ({ page }) => {
        const target = pages().find((entry) => entry.name === item);
        if (!target) throw new Error(`no such page: ${item}`);
        await page.goto(target.path);
        await expect(page.getByRole('heading', { level: 1, name: target.heading })).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
        expect(await seriousViolations(page)).toEqual([]);
      });
    }

    test('the dialogues that open from a page have none either', async ({ page }) => {
      await page.goto('/modules');
      await page
        .getByRole('button', { name: /New module|Add a module/u })
        .first()
        .click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await page.goto('/concepts');
      await page
        .getByRole('button', { name: /New concept|Add a concept/u })
        .first()
        .click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+o');
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    });
  });
}
