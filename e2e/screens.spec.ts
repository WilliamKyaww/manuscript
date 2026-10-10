import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { type APIRequestContext, expect, test } from '@playwright/test';
import { makePptx } from '../apps/server/test/fixtures/sources/builders';
import { E2E_TOKEN } from './constants';

/**
 * Screenshots of every major screen with content, in both themes (Phase 20, tasks 20.01–20.24): the
 * material for the screen-by-screen review and for the pictures in the README and the guides. Not a
 * test of behaviour, so it only runs when asked for:
 *
 *   SKB_SCREENSHOTS=docs/screenshots npx playwright test e2e/screens.spec.ts
 *
 * The folder is relative to the repository. `SKB_SCREENSHOT_WIDTH` sets the viewport width (1440).
 */

const target = process.env.SKB_SCREENSHOTS;
const width = Number(process.env.SKB_SCREENSHOT_WIDTH ?? 1440);
const auth = { Authorization: `Bearer ${E2E_TOKEN}` };

async function create<T>(request: APIRequestContext, url: string, data: unknown): Promise<T> {
  const response = await request.post(url, { headers: auth, data });
  expect(response.status(), `${url}: ${await response.text()}`).toBeLessThan(300);
  return (await response.json()) as T;
}

const day = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

interface Seed {
  module: string;
  other: string;
  lecture: string;
  concept: string;
  note: string;
  source: string;
  cardSet: string;
  attempt: string;
}
let seed: Seed;

test.describe.configure({ mode: 'serial' });
test.skip(!target, 'Set SKB_SCREENSHOTS=<folder> to take screenshots.');

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  const module = await create<{ id: string }>(request, '/api/modules', {
    code: 'COC251',
    title: 'Distributed Systems',
    credits: 15,
    semester: 'Autumn',
  });
  const other = await create<{ id: string }>(request, '/api/modules', {
    code: 'COC262',
    title: 'Machine Learning',
    credits: 15,
    semester: 'Autumn',
  });
  await create(request, `/api/modules/${module.id}/assessments`, {
    title: 'Exam',
    kind: 'exam',
    weight: 0.7,
    dueAt: day(34),
  });
  await create(request, `/api/modules/${module.id}/assessments`, {
    title: 'Coursework 1: Raft in Go',
    kind: 'coursework',
    weight: 0.3,
    dueAt: day(9),
  });
  await create(request, `/api/modules/${other.id}/assessments`, {
    title: 'Exam',
    kind: 'exam',
    weight: 1,
    dueAt: day(40),
  });
  const lectures: { id: string }[] = [];
  for (const [index, [key, title]] of [
    ['L1', 'Time and clocks'],
    ['L2', 'Consensus and Paxos'],
    ['L3', 'Raft'],
    ['L4', 'Replication and consistency'],
  ].entries()) {
    lectures.push(
      await create<{ id: string }>(request, `/api/modules/${module.id}/lectures`, {
        key,
        title,
        heldOn: day(index - 2),
      }),
    );
  }

  const names = [
    ['Logical clocks', 'Lamport clocks order events without a shared physical clock.'],
    ['Consensus', 'Getting a set of nodes to agree on one value despite failures.'],
    ['Paxos', 'A family of protocols for consensus in an unreliable network.'],
    ['Raft', 'A consensus algorithm designed to be understandable: leader, log, safety.'],
    [
      'Leader election',
      'Choosing one node to coordinate the others, with terms to order elections.',
    ],
    ['Log replication', 'The leader appends entries and followers copy them in order.'],
    ['Quorum', 'A majority whose overlap guarantees that two decisions cannot disagree.'],
    [
      'Linearizability',
      'Every operation appears to take effect at one instant between call and reply.',
    ],
    ['Two-phase commit', 'An atomic commitment protocol that blocks when the coordinator fails.'],
    ['CAP theorem', 'Under a partition a system chooses between consistency and availability.'],
  ] as const;
  const ids = new Map<string, string>();
  for (const [name, summary] of names) {
    const created = await create<{ id: string }>(request, '/api/concepts', {
      name,
      summary,
      moduleIds: [module.id],
    });
    ids.set(name, created.id);
  }
  const relate = (from: string, to: string, relation: string) =>
    create(request, '/api/relations', { from: ids.get(from), to: ids.get(to), relation });
  await relate('Logical clocks', 'Consensus', 'prerequisite_for');
  await relate('Consensus', 'Paxos', 'prerequisite_for');
  await relate('Consensus', 'Raft', 'prerequisite_for');
  await relate('Leader election', 'Raft', 'part_of');
  await relate('Log replication', 'Raft', 'part_of');
  await relate('Quorum', 'Paxos', 'part_of');
  await relate('Quorum', 'Raft', 'part_of');
  await relate('Paxos', 'Raft', 'contrasts_with');
  await relate('Linearizability', 'Consensus', 'relates_to');
  await relate('Two-phase commit', 'Consensus', 'contrasts_with');
  await relate('CAP theorem', 'Linearizability', 'relates_to');

  const note = await create<{ id: string }>(request, '/api/notes', {
    title: 'Raft notes',
    content: [
      '---',
      'module: COC251',
      'lecture: L3',
      'tags: [consensus, exam]',
      '---',
      '# Raft',
      '',
      'Raft splits consensus into **leader election**, **log replication** and *safety*. See [[Paxos]] for the',
      'older approach and [[Quorum]] for why a majority is enough.',
      '',
      '> [!tip] Remember',
      '> A candidate needs votes from a majority of the cluster, so two leaders cannot share a term.',
      '',
      '## Terms',
      '',
      '- Every election starts a new *term*.',
      '- A leader sends heartbeats; a follower that hears none becomes a candidate.',
      '',
      '```go',
      'func (n *Node) startElection() {',
      '    n.term++',
      '    n.votes = 1',
      '}',
      '```',
      '',
      'The commit rule: an entry is committed once it is on a majority, $N/2 + 1$ servers.',
      '',
    ].join('\n'),
  });
  await create<{ id: string }>(request, '/api/notes', {
    title: 'Revision plan',
    content: '# Revision plan\n\n- [ ] Re-read [[Raft notes]]\n- [x] Past paper 2024\n',
  });

  const imported = await request.post('/api/sources', {
    headers: auth,
    multipart: {
      file: {
        name: 'Raft lecture.pptx',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        buffer: Buffer.from(
          makePptx([
            { title: 'Raft', body: ['Understandable consensus', '>Leader, log, safety'] },
            {
              title: 'Leader election',
              body: ['Terms order elections', '>A candidate needs a majority'],
            },
            { title: 'Log replication', body: ['AppendEntries carries entries and heartbeats'] },
          ]),
        ),
      },
      module: 'COC251',
    },
  });
  expect(imported.status()).toBeLessThan(300);
  const source = ((await imported.json()) as { source: { id: string } }).source;
  await create(request, `/api/lectures/${lectures[2]?.id}/sources`, { sourceId: source.id });

  const cardSet = await create<{ id: string }>(request, '/api/card-sets', {
    title: 'Consensus terms',
    moduleId: module.id,
  });
  for (const [front, back] of [
    ['What does a quorum guarantee?', 'Any two quorums overlap in at least one node.'],
    ['Why does Raft use terms?', 'To order elections and detect stale leaders.'],
    ['What blocks two-phase commit?', 'A failed coordinator after the participants have voted.'],
    [
      'Linearizability, in one sentence',
      'Operations appear to happen instantly, in real-time order.',
    ],
  ])
    await create(request, '/api/cards', {
      setId: cardSet.id,
      kind: 'basic',
      front,
      back,
      conceptIds: [ids.get('Quorum')],
    });

  const questions: { id: string }[] = [];
  for (const [stem, concept] of [
    ['What does a candidate need to become leader?', 'Raft'],
    ['Which property do two quorums share?', 'Quorum'],
    ['What does Paxos assume about the network?', 'Paxos'],
    ['Which operation orders events by logical time?', 'Logical clocks'],
  ] as const)
    questions.push(
      await create<{ id: string }>(request, '/api/questions', {
        stem,
        answer: {
          kind: 'mcq',
          options: [
            { id: 'a', text: 'A majority of votes', correct: true },
            { id: 'b', text: 'Every node’s vote', correct: false },
          ],
        },
        conceptIds: [ids.get(concept)],
        moduleId: module.id,
      }),
    );
  const quiz = await create<{ id: string }>(request, '/api/quizzes', {
    kind: 'practice',
    config: {},
  });
  const attempt = await create<{ id: string }>(request, `/api/quizzes/${quiz.id}/attempts`, {});
  for (const [index, question] of questions.entries())
    await create(request, `/api/attempts/${attempt.id}/answers`, {
      questionId: question.id,
      response: { kind: 'mcq', choice: index === 2 ? 'b' : 'a' },
    });
  await create(request, '/api/plan/generate', { days: 14 });

  seed = {
    module: module.id,
    other: other.id,
    lecture: lectures[2]?.id as string,
    concept: ids.get('Raft') as string,
    note: note.id,
    source: source.id,
    cardSet: cardSet.id,
    attempt: attempt.id,
  };
});

const SCREENS = (): { name: string; path: string; wait?: string }[] => [
  { name: 'today', path: '/' },
  { name: 'note', path: `/notes/${seed.note}` },
  { name: 'search', path: '/search?q=quorum' },
  { name: 'library', path: '/library' },
  { name: 'source', path: `/library/${seed.source}` },
  { name: 'modules', path: '/modules' },
  { name: 'module', path: `/modules/${seed.module}` },
  { name: 'lecture', path: `/lectures/${seed.lecture}` },
  { name: 'concepts', path: '/concepts' },
  { name: 'concept', path: `/concepts/${seed.concept}` },
  { name: 'graph', path: '/graph', wait: '[data-graph-canvas][data-layout="done"]' },
  { name: 'review', path: '/review' },
  { name: 'card-set', path: `/review/sets/${seed.cardSet}` },
  { name: 'review-session', path: '/review/session' },
  { name: 'practice', path: '/practice' },
  { name: 'quiz', path: `/practice/attempts/${seed.attempt}` },
  { name: 'question-bank', path: '/practice/questions' },
  { name: 'progress', path: '/progress' },
  { name: 'plan', path: '/plan' },
  { name: 'inbox', path: '/inbox' },
  { name: 'chat', path: '/chat' },
  { name: 'settings', path: '/settings' },
  { name: 'diagnostics', path: '/diagnostics' },
  { name: 'design-system', path: '/design-system' },
];

for (const scheme of ['light', 'dark'] as const) {
  test(`screens in the ${scheme} theme`, async ({ page }) => {
    test.setTimeout(240_000);
    const folder = path.resolve(target ?? '.');
    mkdirSync(folder, { recursive: true });
    await page.setViewportSize({ width, height: Math.round((width * 9) / 16) });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto(`/auth?token=${E2E_TOKEN}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    for (const screen of SCREENS()) {
      await page.goto(screen.path);
      await expect(page.locator('[data-page-header]')).toBeVisible();
      if (screen.wait)
        await page
          .locator(screen.wait)
          .waitFor({ timeout: 30_000 })
          .catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(folder, `${screen.name}-${scheme}.png`) });
    }
  });
}
