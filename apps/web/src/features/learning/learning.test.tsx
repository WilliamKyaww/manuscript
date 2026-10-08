import { moduleSummary, requirementFor } from '@skb/core';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';

const COURSE = 'crs_01J9Z3K4M2Q8R5T7V9X1Y3Z5E0';
const MODULE = 'mod_01J9Z3K4M2Q8R5T7V9X1Y3Z5E1';
const LECTURE = 'lec_01J9Z3K4M2Q8R5T7V9X1Y3Z5E2';
const EXAM = 'asm_01J9Z3K4M2Q8R5T7V9X1Y3Z5E3';
const COURSEWORK = 'asm_01J9Z3K4M2Q8R5T7V9X1Y3Z5E4';
const NOTE = 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5E5';
const CONCEPT = 'con_01J9Z3K4M2Q8R5T7V9X1Y3Z5E6';
const now = '2026-10-08T12:00:00.000Z';

const assessments = [
  {
    id: COURSEWORK,
    moduleId: MODULE,
    title: 'Coursework',
    kind: 'coursework',
    weight: 0.4,
    dueAt: '2026-10-01',
    durationMinutes: null,
    status: 'marked',
    markAchieved: 70,
    notes: '',
  },
  {
    id: EXAM,
    moduleId: MODULE,
    title: 'Exam',
    kind: 'exam',
    weight: 0.6,
    dueAt: '2026-10-14T09:30',
    durationMinutes: 120,
    status: 'planned',
    markAchieved: null,
    notes: '',
  },
];
const marks = moduleSummary(assessments);
const ref = { id: MODULE, code: 'COC251', title: 'Distributed Systems' };
const summary = {
  ...ref,
  courseId: COURSE,
  credits: 20,
  semester: '1',
  colour: '#2f6f4e',
  targetMark: 70,
  archived: false,
  counts: { lectures: 1, assessments: 2, sources: 0, notes: 1, concepts: 1 },
  marks,
  requirement: requirementFor(70, marks),
  nextDeadline: {
    assessmentId: EXAM,
    title: 'Exam',
    kind: 'exam',
    dueAt: '2026-10-14T09:30',
    weight: 0.6,
    module: ref,
  },
};
const lecture = {
  id: LECTURE,
  moduleId: MODULE,
  key: 'L03',
  title: 'Consensus',
  kind: 'lecture',
  week: 3,
  heldOn: '2026-10-12',
  ordinal: 0,
  sourceCount: 0,
  noteCount: 0,
};
const note = { id: NOTE, path: 'Modules/COC251/Paxos.md', title: 'Paxos' };
const tree = {
  notes: [{ ...note, type: null, aliases: [], updatedAt: now }],
  folders: ['Modules', 'Modules/COC251'],
  attachments: [],
  index: {
    state: 'ready',
    notes: 1,
    attachments: 0,
    processed: 0,
    total: 0,
    lastScanAt: null,
    lastScanMs: null,
  },
};
const concept = {
  id: CONCEPT,
  name: 'CAP theorem',
  slug: 'cap-theorem',
  aliases: ['Brewer'],
  summary: 'Pick **two**.',
  importance: 1,
  moduleIds: [MODULE],
  topicIds: [],
  noteId: null,
  mentionCount: 1,
  createdAt: now,
  updatedAt: now,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fakeServer() {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetch: FakeFetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, path: url.pathname, body });
    const path = url.pathname;
    if (path === '/api/health') return json(HEALTH);
    if (path === '/api/notes') return json(tree);
    if (path === '/api/templates') return json({ folder: 'Templates', templates: [] });
    if (path === '/api/sources') return json({ sources: [] });
    if (path === '/api/courses')
      return json({
        courses: [
          {
            id: COURSE,
            title: 'Year 3',
            startDate: '2026-09-28',
            endDate: '2027-06-11',
            targetAverage: 85,
            notes: '',
            moduleCount: 1,
            marks,
            requirement: requirementFor(85, marks),
          },
        ],
      });
    if (path === '/api/modules' && method === 'POST')
      return json(
        { ...summary, id: 'mod_01J9Z3K4M2Q8R5T7V9X1Y3Z5E9', code: body.code, title: body.title },
        201,
      );
    if (path === '/api/modules') return json({ modules: [summary] });
    if (path === `/api/modules/${MODULE}`) {
      return json({
        ...summary,
        lectures: [lecture],
        topics: [],
        assessments,
        sources: [],
        notes: [note],
        concepts: [{ id: CONCEPT, name: 'CAP theorem' }],
      });
    }
    if (path === `/api/assessments/${EXAM}` && method === 'PATCH')
      return json({ ...assessments[1], ...body, status: 'marked' });
    if (path === `/api/lectures/${LECTURE}/notes` && method === 'POST') {
      return json({
        ...lecture,
        noteCount: 1,
        module: ref,
        sources: [],
        notes: [note],
        concepts: [],
      });
    }
    if (path === `/api/lectures/${LECTURE}`)
      return json({ ...lecture, module: ref, sources: [], notes: [], concepts: [] });
    if (path === '/api/deadlines') return json({ deadlines: [summary.nextDeadline] });
    if (path === '/api/concepts' && method === 'POST')
      return json(
        {
          ...concept,
          id: 'con_01J9Z3K4M2Q8R5T7V9X1Y3Z5E8',
          name: body.name,
          aliases: body.aliases,
        },
        201,
      );
    if (path === '/api/concepts') return json({ concepts: [concept] });
    if (path === `/api/concepts/${CONCEPT}`) {
      return json({
        ...concept,
        modules: [ref],
        topics: [],
        note: null,
        mentions: [{ note, lines: [{ line: 4, context: 'See [[CAP theorem]].' }] }],
        passages: [
          {
            source: { id: 'src_01J9Z3K4M2Q8R5T7V9X1Y3Z5E7', title: 'Lecture 3' },
            section: { ordinal: 1, label: 'p. 2' },
            locator: { kind: 'pdf', sourceId: 'src_01J9Z3K4M2Q8R5T7V9X1Y3Z5E7', page: 2 },
            snippet: [{ text: 'CAP theorem', match: true }],
          },
        ],
      });
    }
    return json(
      { type: 'urn:skb:problem:not_found', title: 'Not found', status: 404, code: 'not_found' },
      404,
    );
  };
  return { fetch, calls };
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => resetUiState());

describe('modules', () => {
  it('lists modules with marks, the target and the next deadline, and creates one', async () => {
    const server = fakeServer();
    renderApp('/modules', server.fetch);
    const card = await screen.findByRole('link', { name: /COC251/ });
    expect(card).toHaveAttribute('href', `/modules/${MODULE}`);
    expect(
      within(card).getByText(/Needs an average of 70 % on the remaining 60 % for 70 %/),
    ).toBeInTheDocument();
    expect(within(card).getByText(/Next: Exam, Wed 14 Oct, 09:30/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Year 3' })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'New module' }));
    const dialog = await screen.findByRole('dialog', { name: 'New module' });
    await user.type(within(dialog).getByLabelText('Code'), 'COC254');
    await user.type(within(dialog).getByLabelText('Title'), 'Machine Learning');
    await user.type(within(dialog).getByLabelText('Credits'), '40');
    await user.click(within(dialog).getByRole('button', { name: 'Create module' }));
    await waitFor(() =>
      expect(
        server.calls.some((call) => call.method === 'POST' && call.path === '/api/modules'),
      ).toBe(true),
    );
    expect(server.calls.find((call) => call.method === 'POST')?.body).toMatchObject({
      code: 'COC254',
      title: 'Machine Learning',
      credits: 40,
      courseId: COURSE,
    });
  });

  it('shows the calculator and saves a typed mark', async () => {
    const server = fakeServer();
    renderApp(`/modules/${MODULE}`, server.fetch);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'COC251 Distributed Systems' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Best possible').nextSibling).toHaveTextContent('88 %');
    const user = userEvent.setup();
    const mark = screen.getByRole('textbox', { name: 'Mark for Exam (%)' });
    await user.type(mark, '82{Enter}');
    await waitFor(() =>
      expect(server.calls.find((call) => call.method === 'PATCH')).toMatchObject({
        path: `/api/assessments/${EXAM}`,
        body: { markAchieved: 82 },
      }),
    );
    expect(screen.getByRole('link', { name: /Consensus/ })).toHaveAttribute(
      'href',
      `/lectures/${LECTURE}`,
    );
  });

  it('edits an assessment and records it as submitted', async () => {
    const server = fakeServer();
    renderApp(`/modules/${MODULE}`, server.fetch);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Exam' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit assessment' });
    expect(within(dialog).getByLabelText('Weight (%)')).toHaveValue('60');
    expect(within(dialog).getByLabelText('Due')).toHaveValue('2026-10-14');
    expect(within(dialog).getByLabelText('Time')).toHaveValue('09:30');
    await user.clear(within(dialog).getByLabelText('Weight (%)'));
    await user.type(within(dialog).getByLabelText('Weight (%)'), '55');
    await user.click(within(dialog).getByLabelText(/Submitted, waiting for the mark/));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(server.calls.find((call) => call.method === 'PATCH')).toMatchObject({
        path: `/api/assessments/${EXAM}`,
        body: {
          title: 'Exam',
          weight: 0.55,
          dueAt: '2026-10-14T09:30',
          markAchieved: null,
          status: 'submitted',
        },
      }),
    );
  });

  it('attaches an existing note to a lecture', async () => {
    const server = fakeServer();
    renderApp(`/lectures/${LECTURE}`, server.fetch);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'L03 Consensus' }),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.type(screen.getByRole('combobox', { name: 'Existing note to attach' }), 'Paxos');
    await user.click(screen.getAllByRole('button', { name: 'Attach' })[1] as HTMLElement);
    await waitFor(() =>
      expect(
        server.calls.find((call) => call.path === `/api/lectures/${LECTURE}/notes`)?.body,
      ).toEqual({ noteId: NOTE }),
    );
  });
});

describe('concepts', () => {
  it('lists concepts and creates one with aliases', async () => {
    const server = fakeServer();
    renderApp('/concepts', server.fetch);
    const row = await screen.findByRole('link', { name: /CAP theorem/ });
    expect(within(row).getByText('also Brewer')).toBeInTheDocument();
    expect(within(row).getByText('COC251')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'New concept' }));
    const dialog = await screen.findByRole('dialog', { name: 'New concept' });
    await user.type(within(dialog).getByLabelText('Name'), 'Raft');
    await user.type(within(dialog).getByLabelText('Aliases'), 'Raft consensus, raft algorithm');
    await user.click(within(dialog).getByRole('button', { name: 'Create concept' }));
    await waitFor(() =>
      expect(
        server.calls.find((call) => call.method === 'POST' && call.path === '/api/concepts')?.body,
      ).toMatchObject({
        name: 'Raft',
        aliases: ['Raft consensus', 'raft algorithm'],
      }),
    );
  });

  it('shows mentions and source passages that open at the page', async () => {
    renderApp(`/concepts/${CONCEPT}`, fakeServer().fetch);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'CAP theorem' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See [[CAP theorem]].' })).toHaveAttribute(
      'href',
      `/notes/${NOTE}?line=4`,
    );
    expect(screen.getByRole('link', { name: /Lecture 3 › p\. 2/ })).toHaveAttribute(
      'href',
      '/library/src_01J9Z3K4M2Q8R5T7V9X1Y3Z5E7?page=2',
    );
    expect(await screen.findByText('two')).toBeInTheDocument();
  });
});

describe('today', () => {
  it('shows upcoming deadlines and progress towards the target', async () => {
    renderApp('/', fakeServer().fetch);
    const deadlines = await screen.findByRole('list', { name: 'Upcoming deadlines' });
    expect(within(deadlines).getByRole('link', { name: 'COC251 Exam' })).toHaveAttribute(
      'href',
      `/modules/${MODULE}`,
    );
    expect(within(deadlines).getByText(/60 % of the module/)).toBeInTheDocument();
    expect(await screen.findByText(/Year 3 · target average 85 %/)).toBeInTheDocument();
  });
});
