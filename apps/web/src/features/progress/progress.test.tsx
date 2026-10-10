import type { MasteryComponents } from '@skb/core';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  json,
  learning,
  notFound,
  overview,
  RAFT,
  raftProgress,
  weakAreas,
} from '../../test/practice-fixtures';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';
import { explainMastery, masteryFormula } from '../practice/format';

beforeEach(() => resetUiState());

const fetch: FakeFetch = async (input) => {
  const url = new URL(String(input), 'http://localhost');
  if (url.pathname === '/api/health') return json(HEALTH);
  if (url.pathname === '/api/progress') return json(overview);
  if (url.pathname === '/api/mastery/weak') return json(weakAreas);
  if (url.pathname === `/api/mastery/concepts/${RAFT}`)
    return json({
      ...raftProgress,
      computedAt: '2026-10-09T10:00:00.000Z',
      cards: { linked: 2, reviewed: 2 },
      questions: { linked: 2, answered: 2 },
      answers: [],
    });
  if (url.pathname === '/api/concepts') return json({ concepts: [] });
  if (url.pathname === '/api/modules') return json({ modules: [] });
  return notFound();
};

describe('the mastery explanation', () => {
  it('says what the figure is made of and shows the sum', () => {
    const components = learning as MasteryComponents;
    expect(explainMastery(components)).toEqual([
      'recall 0.80 from 2 card faces',
      'questions 30 % over 2.0 weighted answers',
      '0 of 4 items never practised',
      'confidence: medium',
    ]);
    // (0.80 × 2 + 1.5 × 0.30 × 2) / (2 + 1.5 × 2) = 2.5 / 5 = 0.50
    expect(masteryFormula(components)).toBe(
      '(0.80 × 2 + 1.5 × 0.30 × 2.00) / (2 + 1.5 × 2.00) = 0.50',
    );
    expect(masteryFormula({ ...components, mastery: null })).toBeNull();
  });
});

describe('the progress page', () => {
  it('shows readiness, weak areas with reasons, and each concept’s evidence', async () => {
    const user = userEvent.setup();
    renderApp('/progress', fetch);
    expect(await screen.findByRole('heading', { level: 1, name: 'Progress' })).toBeInTheDocument();
    expect((await screen.findAllByText('25 %')).length).toBeGreaterThan(0);
    const weak = await screen.findByRole('list', { name: 'Weak areas' });
    expect(within(weak).getByText('Mastery 0.50 with medium confidence.')).toBeInTheDocument();
    expect(within(weak).getByText('Exam in 9 days, 70 % of COC251')).toBeInTheDocument();
    expect(within(weak).getByRole('button', { name: 'Practise Raft' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Write a question for Paxos' })).toBeInTheDocument();
    const bare = screen.getByRole('list', { name: 'Concepts with no cards or questions' });
    expect(within(bare).getByRole('link', { name: 'Paxos' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/concepts\//),
    );

    const concepts = screen.getByRole('list', { name: 'Concepts in COC251' });
    await user.click(within(concepts).getByText('Raft'));
    expect(within(concepts).getByText(/recall 0.80 from 2 card faces/)).toBeInTheDocument();
    expect(
      within(concepts).getByText(
        'mastery = (0.80 × 2 + 1.5 × 0.30 × 2.00) / (2 + 1.5 × 2.00) = 0.50',
      ),
    ).toBeInTheDocument();
  });

  it('shows the mastery panel on a concept page', async () => {
    const conceptFetch: FakeFetch = async (input, init) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === `/api/concepts/${RAFT}`)
        return json({
          id: RAFT,
          name: 'Raft',
          slug: 'raft',
          aliases: [],
          summary: '',
          importance: 1,
          moduleIds: [],
          topicIds: [],
          noteId: null,
          mentionCount: 0,
          note: null,
          modules: [],
          topics: [],
          mentions: [],
          passages: [],
          createdAt: '2026-10-09T10:00:00.000Z',
          updatedAt: '2026-10-09T10:00:00.000Z',
        });
      return fetch(input, init);
    };
    renderApp(`/concepts/${RAFT}`, conceptFetch);
    expect(await screen.findByTestId('concept-mastery')).toHaveTextContent('0.50');
    const panel = screen.getByRole('region', { name: 'Mastery' });
    expect(within(panel).getByText('Learning')).toBeInTheDocument();
    expect(within(panel).getByText('Mastery 0.50 with medium confidence.')).toBeInTheDocument();
    expect(
      within(panel).getByText('At stake: Exam in 9 days, 70 % of COC251.'),
    ).toBeInTheDocument();
  });
});
