import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { json, notFound } from '../../test/practice-fixtures';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';

const PLAN = 'plan_01J9Z3K4M2Q8R5T7V9X1Y3Z5P1';
const TODAY = '2026-10-09';
const NOW = '2026-10-09T10:00:00.000Z';

const item = (
  n: number,
  date: string,
  kind: string,
  title: string,
  reason: string,
  extra = {},
) => ({
  id: `pli_01J9Z3K4M2Q8R5T7V9X1Y3Z5T${n}`,
  planId: PLAN,
  date,
  kind,
  targetType: null,
  targetId: null,
  title,
  minutes: 25,
  reason,
  status: 'planned',
  completedAt: null as string | null,
  ...extra,
});

const planned = () => ({
  id: PLAN,
  title: 'Study plan',
  startDate: TODAY,
  endDate: '2026-10-11',
  generatedBy: 'planner',
  createdAt: NOW,
  updatedAt: NOW,
  items: [
    item(
      1,
      TODAY,
      'review',
      'Review 12 cards',
      '12 cards are due now; about 3 min at 15 s a card.',
    ),
    item(
      2,
      TODAY,
      'practice',
      'Practise Raft log matching',
      'Weak: Raft log matching — 0.48, Exam in 9 days, 30 % of CS301.',
    ),
    item(
      3,
      '2026-10-10',
      'coursework',
      'CS301 Coursework 1',
      '3 h left, due in 4 days (30 % of CS301).',
    ),
  ],
  unscheduled: [{ title: 'Mock exam: CS301 Exam', reason: 'No day has 90 free minutes.' }],
  capacity: [
    { date: TODAY, minutes: 90 },
    { date: '2026-10-10', minutes: 45 },
    { date: '2026-10-11', minutes: 0 },
  ],
});

const SETTINGS = {
  minutesByWeekday: [90, 90, 90, 90, 90, 45, 45],
  blockedDates: [],
  sessionMinutes: 25,
  examRetention: true,
};

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

function fakeServer(options: { withPlan?: boolean } = {}) {
  const calls: Call[] = [];
  let plan: ReturnType<typeof planned> | null = options.withPlan ? planned() : null;
  let settings = { ...SETTINGS };
  const fetch: FakeFetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, path: url.pathname, body });
    const path = url.pathname;
    if (path === '/api/health') return json(HEALTH);
    if (path === '/api/plan' && method === 'GET') return json({ plan, today: TODAY });
    if (path === '/api/plan/generate') {
      plan = planned();
      return json(plan);
    }
    const match = path.match(/^\/api\/plan\/items\/([^/]+)$/u);
    if (match && plan) {
      const found = plan.items.find((entry) => entry.id === match[1]);
      if (!found) return notFound();
      found.status = body?.status as string;
      found.completedAt = found.status === 'planned' ? null : NOW;
      return json(found);
    }
    if (path === '/api/settings/plan') {
      if (method === 'PATCH') settings = { ...settings, ...body } as typeof settings;
      return json(settings);
    }
    return notFound();
  };
  return {
    fetch,
    find: (method: string, path: string) =>
      calls.filter((call) => call.method === method && call.path === path),
  };
}

beforeEach(() => resetUiState());

describe('the Plan page', () => {
  it('explains an empty plan, makes one, and shows why every item is there', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderApp('/plan', server.fetch);
    expect(await screen.findByRole('heading', { name: 'No plan yet' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Days to plan'), '14');
    await user.click(screen.getAllByRole('button', { name: /Make a/u })[0] as HTMLElement);
    await waitFor(() => expect(server.find('POST', '/api/plan/generate')).toHaveLength(1));
    expect(server.find('POST', '/api/plan/generate')[0]?.body).toEqual({ days: 14 });

    const today = await screen.findByRole('region', { name: 'Fri 9 Oct' });
    expect(within(today).getByText('Today')).toBeInTheDocument();
    expect(within(today).getByText('Review 12 cards')).toBeInTheDocument();
    expect(
      within(today).getByText('Weak: Raft log matching — 0.48, Exam in 9 days, 30 % of CS301.'),
    ).toBeInTheDocument();
    expect(within(today).getByText('3 of 90 min'.replace('3', '50'))).toBeInTheDocument();
    // What could not be fitted in says why, and where to change it.
    expect(screen.getByRole('note')).toHaveTextContent('No day has 90 free minutes.');
    expect(screen.getByRole('link', { name: 'Settings → Study plan' })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('ticks items off, skips them and puts them back', async () => {
    const user = userEvent.setup();
    const server = fakeServer({ withPlan: true });
    renderApp('/plan', server.fetch);
    await user.click(await screen.findByRole('button', { name: 'Mark done: Review 12 cards' }));
    await waitFor(() =>
      expect(
        server.find('PATCH', '/api/plan/items/pli_01J9Z3K4M2Q8R5T7V9X1Y3Z5T1')[0]?.body,
      ).toEqual({
        status: 'done',
      }),
    );
    expect(
      await screen.findByRole('button', { name: 'Put back: Review 12 cards' }),
    ).toHaveAttribute('aria-pressed', 'true');
    const row = screen.getByText('Practise Raft log matching').closest('li') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /Skip/u }));
    await waitFor(() =>
      expect(
        server.find('PATCH', '/api/plan/items/pli_01J9Z3K4M2Q8R5T7V9X1Y3Z5T2')[0]?.body,
      ).toEqual({
        status: 'skipped',
      }),
    );
    expect(await within(row).findByText('· skipped')).toBeInTheDocument();
    expect(screen.getByText(/3 items · .* · 1 done/u)).toBeInTheDocument();
  });

  it('can be read as a list', async () => {
    const user = userEvent.setup();
    renderApp('/plan', fakeServer({ withPlan: true }).fetch);
    await user.click(await screen.findByRole('radio', { name: 'List' }));
    const list = await screen.findByRole('list', { name: 'Plan' });
    expect(within(list).getByText('CS301 Coursework 1')).toBeInTheDocument();
    expect(within(list).getByText('Nothing planned.')).toBeInTheDocument();
  });
});

describe('Today', () => {
  it('shows what is planned for today, with its reasons', async () => {
    renderApp('/', fakeServer({ withPlan: true }).fetch);
    const list = await screen.findByRole('list', { name: 'Today’s plan' });
    expect(within(list).getByText('Review 12 cards')).toBeInTheDocument();
    expect(within(list).getByText(/12 cards are due now/u)).toBeInTheDocument();
    expect(within(list).queryByText('CS301 Coursework 1')).toBeNull();
    expect(screen.getByRole('link', { name: 'Open the plan' })).toHaveAttribute('href', '/plan');
  });

  it('invites a first plan', async () => {
    renderApp('/', fakeServer().fetch);
    expect(await screen.findByText(/No study plan yet/u)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Make a plan' })).toHaveAttribute('href', '/plan');
  });
});

describe('Settings → Study plan', () => {
  it('saves the minutes for each weekday, days off and the sitting length', async () => {
    const user = userEvent.setup();
    const server = fakeServer();
    renderApp('/settings', server.fetch);
    const form = await screen.findByRole('form', { name: 'Study plan settings' });
    const monday = within(form).getByLabelText('Monday');
    await user.clear(monday);
    await user.type(monday, '30');
    await user.type(within(form).getByLabelText('A day with no study'), '2026-12-25');
    await user.click(within(form).getByRole('button', { name: 'Add' }));
    expect(within(form).getByRole('list', { name: 'Days with no study' })).toHaveTextContent(
      '2026-12-25',
    );
    await user.click(within(form).getByRole('checkbox', { name: /Remember more before an exam/u }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(server.find('PATCH', '/api/settings/plan')).toHaveLength(1));
    expect(server.find('PATCH', '/api/settings/plan')[0]?.body).toEqual({
      minutesByWeekday: [30, 90, 90, 90, 90, 45, 45],
      blockedDates: ['2026-12-25'],
      sessionMinutes: 25,
      examRetention: false,
    });
  });
});
