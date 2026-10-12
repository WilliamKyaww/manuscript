import { expect, type Page, test } from '@playwright/test';
import { seriousViolations } from './axe';
import { E2E_TOKEN } from './constants';
import { expectPageTitle } from './titles';

/**
 * Task 7.13: the graph renders, filters narrow it, and clicking a node opens its page; a proposed
 * relation is reviewed on the concept page. Names are unique to this file (the server is shared).
 */

const auth = { Authorization: `Bearer ${E2E_TOKEN}` };

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { headers: auth, data });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as { id: string };
}

test.beforeEach(async ({ page }) => {
  await page.goto(`/auth?token=${E2E_TOKEN}`);
  await expectPageTitle(page, 'Today');
});

test('the graph renders, filters by module, and a clicked node opens its page', async ({
  page,
}) => {
  // Unique per repeat, so `--repeat-each` runs on the same server do not collide.
  const tag = String(test.info().repeatEachIndex + 10 * test.info().retry);
  const code = `E2E301${tag}`;
  const [quorumName, leasesName] = [`E2E Quorum ${tag}`, `E2E Leases ${tag}`];
  const module = await post(page, '/api/modules', { code, title: 'Graph Systems' });
  const quorum = await post(page, '/api/concepts', { name: quorumName, moduleIds: [module.id] });
  const leases = await post(page, '/api/concepts', { name: leasesName, moduleIds: [module.id] });
  const clocks = await post(page, '/api/concepts', {
    name: `E2E Clocks ${tag}`,
    moduleIds: [module.id],
  });
  await post(page, '/api/notes', {
    title: `E2E graph reading ${tag}`,
    content: `# E2E graph reading\n[[${quorumName}]] needs [[${leasesName}]].`,
    module: code,
  });
  await post(page, '/api/relations', {
    from: quorum.id,
    to: leases.id,
    relation: 'prerequisite_for',
  });
  await post(page, '/api/relations', {
    from: clocks.id,
    to: leases.id,
    relation: 'relates_to',
    confidence: 'INFERRED',
    score: 0.7,
    status: 'proposed',
  });

  await page.goto('/graph');
  const canvas = page.locator('[data-graph-canvas]');
  await expect(canvas).toBeVisible();
  await expect(page.getByRole('list', { name: 'Study prompts' })).toBeVisible();

  // Narrow to this module: only its items remain.
  await page
    .getByRole('combobox', { name: 'Module' })
    .selectOption({ label: `${code} Graph Systems` });
  await expect(page.getByText(/^\d+ items · \d+ connections/)).toHaveText(/^5 items · /);
  await expect(canvas).toHaveAttribute('data-layout', 'done', { timeout: 20_000 });
  await page.getByRole('checkbox', { name: 'Notes', exact: true }).uncheck();
  await expect(page.getByText(/^\d+ items · \d+ connections/)).toHaveText(/^4 items · /);
  await page.getByRole('checkbox', { name: 'Notes', exact: true }).check();

  // Find a node (the camera centres on it), let go of it, then click it on the canvas.
  await page.getByRole('combobox', { name: 'Find in graph' }).fill(quorumName);
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  const details = page.getByRole('region', { name: 'Details' });
  await expect(details.getByRole('heading', { level: 3, name: quorumName })).toBeVisible();
  await expect(
    details.getByRole('list', { name: 'is a prerequisite for' }).getByText(leasesName),
  ).toBeVisible();
  await details.getByRole('button', { name: 'Close details' }).click();
  await expect(page.getByRole('region', { name: 'Insights' })).toBeVisible();
  await page.waitForTimeout(800); // the camera's move
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The canvas has no box.');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(details.getByRole('heading', { level: 3, name: quorumName })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await details.getByRole('button', { name: 'Open' }).click();
  await expectPageTitle(page, quorumName);

  // The proposal is reviewed where it belongs: on the concept page.
  await page.goto(`/concepts/${clocks.id}`);
  const relations = page.getByRole('list', { name: 'Relations' });
  await expect(relations.getByText('proposed')).toBeVisible();
  await relations.getByRole('button', { name: `Accept: relates to ${leasesName}` }).click();
  await expect(relations.getByText('proposed')).toBeHidden();
  await expect(
    relations.getByRole('button', { name: `Remove: relates to ${leasesName}` }),
  ).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
