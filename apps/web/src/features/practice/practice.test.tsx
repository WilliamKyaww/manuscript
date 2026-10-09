import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANS_A,
  ANS_B,
  ATT,
  attempt,
  choice,
  essay,
  json,
  notFound,
  prompt,
  QST_A,
  RAFT,
  result,
} from '../../test/practice-fixtures';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

/** A fake server; `routes` answers the calls a test cares about, by "METHOD /path". */
function fakeServer(routes: Record<string, (body: Record<string, unknown> | null) => Response>) {
  const calls: Call[] = [];
  const fetch: FakeFetch = async (input, init) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ method, path: url.pathname, body });
    if (url.pathname === '/api/health') return json(HEALTH);
    const route = routes[`${method} ${url.pathname}`];
    if (route) return route(body);
    if (url.pathname === '/api/concepts') return json({ concepts: [] });
    if (url.pathname === '/api/modules') return json({ modules: [] });
    return notFound();
  };
  return {
    fetch,
    calls,
    find: (method: string, path: string) =>
      calls.filter((c) => c.method === method && c.path === path),
  };
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
beforeEach(() => resetUiState());

describe('a practice quiz', () => {
  it('checks each answer, asks for a grade on written ones, and shows the score', async () => {
    const user = userEvent.setup();
    let finished = false;
    const graded = {
      ...result(ANS_B, essay, { kind: 'explain', text: 'They overlap' }, 0.5),
      gradedBy: 'self',
    };
    const server = fakeServer({
      [`GET /api/attempts/${ATT}`]: () =>
        json(
          finished
            ? attempt({
                finishedAt: '2026-10-09T10:05:00.000Z',
                score: 0.75,
                items: [
                  {
                    ordinal: 0,
                    prompt: prompt(choice),
                    answer: result(ANS_A, choice, { kind: 'mcq', choice: 'a' }, 1),
                  },
                  { ordinal: 1, prompt: prompt(essay), answer: graded },
                ],
                counts: { total: 2, answered: 2, correct: 1, pending: 0 },
              })
            : attempt(),
        ),
      [`POST /api/attempts/${ATT}/answers`]: (body) =>
        json(
          body?.questionId === QST_A
            ? result(ANS_A, choice, body.response, 1)
            : result(ANS_B, essay, body?.response, null),
          201,
        ),
      [`POST /api/answers/${ANS_B}/grade`]: () => json(graded),
      [`POST /api/attempts/${ATT}/finish`]: () => {
        finished = true;
        return json(attempt({ finishedAt: '2026-10-09T10:05:00.000Z', score: 0.75 }));
      },
    });
    renderApp(`/practice/attempts/${ATT}`, server.fetch);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Practice quiz' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /A leader/ }));
    await user.click(screen.getByRole('radio', { name: 'Sure' }));
    await user.click(screen.getByRole('button', { name: /Check/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Right');
    expect(server.find('POST', `/api/attempts/${ATT}/answers`)[0]?.body).toMatchObject({
      questionId: QST_A,
      response: { kind: 'mcq', choice: 'a' },
      assisted: false,
      confidence: 3,
    });
    // The wrong option explains itself.
    expect(screen.getByText('A quorum votes.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Next question/ }));
    await user.type(screen.getByRole('textbox', { name: 'Your answer' }), 'They overlap');
    await user.click(screen.getByRole('button', { name: /Check/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Waiting for your grade');
    expect(screen.getByText('Two majorities always overlap.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Partly' }));
    await waitFor(() =>
      expect(server.find('POST', `/api/answers/${ANS_B}/grade`)[0]?.body).toEqual({ score: 0.5 }),
    );
    await user.click(await screen.findByRole('button', { name: /Finish and see the score/ }));
    expect(await screen.findByTestId('attempt-score')).toHaveTextContent('75 %');
  });
});

describe('grading with AI', () => {
  it('suggests a grade that counts only once the student accepts it', async () => {
    const user = userEvent.setup();
    const pending = result(ANS_B, essay, { kind: 'explain', text: 'They overlap' }, null);
    const server = fakeServer({
      [`GET /api/attempts/${ATT}`]: () =>
        json(
          attempt({
            items: [
              { ordinal: 0, prompt: prompt(choice), answer: null },
              { ordinal: 1, prompt: prompt(essay), answer: null },
            ],
          }),
        ),
      [`POST /api/attempts/${ATT}/answers`]: () => json(pending, 201),
      'GET /api/ai/status': () =>
        json({
          enabled: true,
          mock: false,
          roles: Object.fromEntries(
            ['chat', 'fast', 'embedding', 'transcription'].map((role) => [
              role,
              { ready: role === 'chat', reason: null, label: null },
            ]),
          ),
          month: {
            requests: 0,
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            budget: null,
            warning: false,
            exhausted: false,
          },
        }),
      [`POST /api/answers/${ANS_B}/ai-grade`]: () =>
        json({
          score: 1,
          feedback: 'You named the overlap of majorities.',
          misconceptions: [],
        }),
      [`POST /api/answers/${ANS_B}/grade`]: () =>
        json({
          ...pending,
          score: 1,
          gradedBy: 'ai',
          feedback: 'You named the overlap of majorities.',
        }),
    });
    renderApp(`/practice/attempts/${ATT}`, server.fetch);
    await user.click(await screen.findByRole('button', { name: /Skip for now/u }));
    const box = await screen.findByRole('textbox', { name: 'Your answer' });
    await user.type(box, 'They overlap');
    await user.click(screen.getByRole('button', { name: /Check/ }));
    await user.click(await screen.findByRole('button', { name: /Suggest a grade with AI/u }));
    expect(await screen.findByText(/AI suggests: Got it/u)).toBeInTheDocument();
    expect(server.find('POST', `/api/answers/${ANS_B}/grade`)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Accept this grade' }));
    await waitFor(() =>
      expect(server.find('POST', `/api/answers/${ANS_B}/grade`)[0]?.body).toEqual({
        score: 1,
        gradedBy: 'ai',
        feedback: 'You named the overlap of majorities.',
      }),
    );
  });
});

describe('a mock exam', () => {
  it('shows the clock, hides feedback and submits every response at once', async () => {
    const user = userEvent.setup();
    const deadline = new Date(Date.now() + 30 * 60_000).toISOString();
    let submitted = false;
    const server = fakeServer({
      [`GET /api/attempts/${ATT}`]: () =>
        json(
          attempt({
            quiz: {
              id: 'quiz_01J9Z3K4M2Q8R5T7V9X1Y3Z5H3',
              title: 'Mock exam — Summer',
              kind: 'mock_exam',
              timeLimitMinutes: 30,
            },
            deadline,
            ...(submitted
              ? {
                  finishedAt: '2026-10-09T10:20:00.000Z',
                  score: 1,
                  items: [
                    {
                      ordinal: 0,
                      prompt: prompt(choice),
                      answer: result(ANS_A, choice, { kind: 'mcq', choice: 'a' }, 1),
                    },
                    { ordinal: 1, prompt: prompt(essay), answer: result(ANS_B, essay, null, 0) },
                  ],
                  counts: { total: 2, answered: 1, correct: 1, pending: 0 },
                }
              : {}),
          }),
        ),
      [`PUT /api/attempts/${ATT}/draft`]: () => json({ ok: true }),
      [`POST /api/attempts/${ATT}/submit`]: () => {
        submitted = true;
        return json(attempt({ finishedAt: '2026-10-09T10:20:00.000Z' }));
      },
    });
    renderApp(`/practice/attempts/${ATT}`, server.fetch);
    expect(await screen.findByRole('timer', { name: 'Time left' })).toHaveTextContent(/^(29|30):/);
    await user.click(screen.getByRole('radio', { name: /A leader/ }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 2 answered')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Submit the mock exam?' });
    expect(
      within(dialog).getByText(/1 question without an answer will score 0/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Submit' }));
    await waitFor(() =>
      expect(server.find('POST', `/api/attempts/${ATT}/submit`)[0]?.body).toEqual({
        responses: { [QST_A]: { kind: 'mcq', choice: 'a' } },
      }),
    );
    expect(await screen.findByTestId('attempt-score')).toHaveTextContent('100 %');
    expect(screen.getByText('Left blank')).toBeInTheDocument();
  });
});

describe('a Learn session', () => {
  it('asks what the engine chooses, shows the feedback, and ends when every concept is secure', async () => {
    const user = userEvent.setup();
    const answered = result(ANS_A, choice, { kind: 'mcq', choice: 'a' }, 1);
    let state = 0;
    const base = {
      attemptId: ATT,
      title: 'Learn — Raft',
      startedAt: '2026-10-09T10:00:00.000Z',
      deadline: null,
      finishedAt: null,
      withoutMaterial: [],
    };
    const server = fakeServer({
      [`GET /api/learn/${ATT}`]: () =>
        json(
          state === 0
            ? {
                ...base,
                current: {
                  prompt: prompt(choice),
                  concept: { id: RAFT, name: 'Raft' },
                  level: 'recognition',
                },
                last: null,
                concepts: [
                  {
                    concept: { id: RAFT, name: 'Raft' },
                    level: 'recognition',
                    shown: 0,
                    correct: 0,
                    secure: false,
                  },
                ],
                answered: 0,
                done: null,
              }
            : {
                ...base,
                current: null,
                last: answered,
                concepts: [
                  {
                    concept: { id: RAFT, name: 'Raft' },
                    level: 'recall',
                    shown: 1,
                    correct: 1,
                    secure: true,
                  },
                ],
                answered: 1,
                done: 'secure',
              },
        ),
      [`POST /api/attempts/${ATT}/answers`]: () => {
        state = 1;
        return json(answered, 201);
      },
    });
    renderApp(`/practice/learn/${ATT}`, server.fetch);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Learn — Raft' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Recognise')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /A leader/ }));
    await user.click(screen.getByRole('button', { name: /Check/ }));
    expect(await screen.findByRole('status')).toHaveTextContent('Right');
    expect(server.find('POST', `/api/attempts/${ATT}/answers`)[0]?.body).toMatchObject({
      questionId: QST_A,
      conceptId: RAFT,
    });
    await user.click(screen.getByRole('button', { name: /Continue/ }));
    expect(
      await screen.findByText('Every concept is secure for this session.'),
    ).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Concepts in this session' });
    expect(within(list).getByLabelText('Secure')).toBeInTheDocument();
  });
});

describe('the question editor', () => {
  it('writes a multiple-choice question with its key, explanation and tags', async () => {
    const user = userEvent.setup();
    const server = fakeServer({
      'GET /api/questions': () => json({ questions: [] }),
      'POST /api/questions': (body) => json({ ...choice, ...body }, 201),
    });
    renderApp('/practice/questions', server.fetch);
    await user.click(await screen.findByRole('button', { name: 'Write a question' }));
    const dialog = await screen.findByRole('dialog', { name: 'New question' });
    await user.type(within(dialog).getByLabelText('Question'), 'What does Raft elect?');
    await user.type(within(dialog).getByRole('textbox', { name: 'Option 1' }), 'A quorum');
    await user.type(within(dialog).getByRole('textbox', { name: 'Option 2' }), 'A leader');
    await user.click(within(dialog).getByRole('radio', { name: 'Option 2 is right' }));
    await user.type(within(dialog).getByLabelText('Why option 1 is wrong'), 'A quorum votes.');
    await user.type(within(dialog).getByLabelText('Explanation'), 'Raft is leader-based.');
    await user.type(within(dialog).getByLabelText('Tags'), 'raft #consensus');
    await user.click(within(dialog).getByRole('button', { name: 'Add question' }));
    await waitFor(() => expect(server.find('POST', '/api/questions')).toHaveLength(1));
    expect(server.find('POST', '/api/questions')[0]?.body).toMatchObject({
      stem: 'What does Raft elect?',
      answer: {
        kind: 'mcq',
        options: [
          { id: 'a', text: 'A quorum', correct: false, explanation: 'A quorum votes.' },
          { id: 'b', text: 'A leader', correct: true, explanation: '' },
        ],
      },
      explanation: 'Raft is leader-based.',
      tags: ['raft', 'consensus'],
      difficulty: 3,
    });
  });

  it('refuses options without text before sending anything', async () => {
    const user = userEvent.setup();
    const server = fakeServer({ 'GET /api/questions': () => json({ questions: [] }) });
    renderApp('/practice/questions', server.fetch);
    await user.click(await screen.findByRole('button', { name: 'Write a question' }));
    const dialog = await screen.findByRole('dialog', { name: 'New question' });
    await user.type(within(dialog).getByLabelText('Question'), 'Empty options');
    await user.click(within(dialog).getByRole('button', { name: 'Add question' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Every option needs some text.',
    );
    expect(server.find('POST', '/api/questions')).toHaveLength(0);
  });
});
