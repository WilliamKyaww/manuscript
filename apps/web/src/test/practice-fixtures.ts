/** Valid API payloads for the practice and progress component tests (Phase 9). */

export const now = '2026-10-09T10:00:00.000Z';
export const QST_A = 'qst_01J9Z3K4M2Q8R5T7V9X1Y3Z5H1';
export const QST_B = 'qst_01J9Z3K4M2Q8R5T7V9X1Y3Z5H2';
export const QUIZ = 'quiz_01J9Z3K4M2Q8R5T7V9X1Y3Z5H3';
export const ATT = 'att_01J9Z3K4M2Q8R5T7V9X1Y3Z5H4';
export const ANS_A = 'ans_01J9Z3K4M2Q8R5T7V9X1Y3Z5H5';
export const ANS_B = 'ans_01J9Z3K4M2Q8R5T7V9X1Y3Z5H6';
export const RAFT = 'con_01J9Z3K4M2Q8R5T7V9X1Y3Z5H7';
export const PAXOS = 'con_01J9Z3K4M2Q8R5T7V9X1Y3Z5H9';
export const MOD = 'mod_01J9Z3K4M2Q8R5T7V9X1Y3Z5H8';

const concepts = [{ id: RAFT, name: 'Raft' }];

export const mcqAnswer = {
  kind: 'mcq',
  options: [
    { id: 'a', text: 'A leader', correct: true, explanation: '' },
    { id: 'b', text: 'A quorum', correct: false, explanation: 'A quorum votes.' },
  ],
};

export const question = (id: string, stem: string, answer: unknown, extra = {}) => ({
  id,
  kind: (answer as { kind: string }).kind,
  stem,
  answer,
  rubric: '',
  explanation: 'Because it is.',
  hint: '',
  difficulty: 3,
  status: 'active',
  module: null,
  lecture: null,
  tags: [],
  locator: null,
  concepts,
  createdBy: 'user',
  createdAt: now,
  updatedAt: now,
  stats: { answers: 0, lastScore: null, lastAnsweredAt: null },
  ...extra,
});

export const choice = question(QST_A, 'What does Raft elect?', mcqAnswer);
export const essay = question(QST_B, 'Explain why Raft needs a majority.', {
  kind: 'explain',
  model: 'Two majorities always overlap.',
});

export const prompt = (q: ReturnType<typeof question>) => {
  const answer = q.answer as { kind: string; options?: { id: string; text: string }[] };
  return {
    id: q.id,
    kind: q.kind,
    stem: q.stem,
    options: answer.options?.map(({ id, text }) => ({ id, text })) ?? null,
    unit: null,
    language: null,
    hint: q.hint,
    difficulty: q.difficulty,
    concepts: q.concepts,
    locator: null,
  };
};

export const result = (
  id: string,
  q: ReturnType<typeof question>,
  response: unknown,
  score: number | null,
) => ({
  id,
  questionId: q.id,
  response,
  score,
  gradedBy: score === null ? null : 'auto',
  feedback: '',
  confidence: null,
  assisted: false,
  answeredAt: now,
  question: q,
});

export const attempt = (overrides: Record<string, unknown> = {}) => ({
  id: ATT,
  quiz: { id: QUIZ, title: 'Practice quiz', kind: 'practice', timeLimitMinutes: null },
  startedAt: now,
  deadline: null,
  finishedAt: null,
  score: null,
  items: [
    { ordinal: 0, prompt: prompt(choice), answer: null },
    { ordinal: 1, prompt: prompt(essay), answer: null },
  ],
  draft: {},
  counts: { total: 2, answered: 0, correct: 0, pending: 0 },
  ...overrides,
});

export const learning = {
  mastery: 0.5,
  stage: 'learning',
  confidence: 'medium',
  recall: 0.8,
  recallCount: 2,
  accuracy: 0.3,
  answerWeight: 2,
  evidence: 5,
  coverage: 1,
  itemsLinked: 4,
  itemsPractised: 4,
};

export const exposure = {
  moduleId: MOD,
  moduleCode: 'COC251',
  assessment: { id: 'asm_01J9Z3K4M2Q8R5T7V9X1Y3Z5HA', title: 'Exam', weight: 0.7, daysUntil: 9 },
  stake: 0.7,
  urgency: 14 / 9,
};

export const raftProgress = {
  concept: { id: RAFT, name: 'Raft', importance: 1 },
  components: learning,
  signals: [{ kind: 'weak', reason: 'Mastery 0.50 with medium confidence.' }],
  priority: 0.5 * 0.7 * (14 / 9),
  exposure,
};

export const paxosProgress = {
  concept: { id: PAXOS, name: 'Paxos', importance: 1 },
  components: {
    mastery: null,
    stage: 'new',
    confidence: 'none',
    recall: null,
    recallCount: 0,
    accuracy: null,
    answerWeight: 0,
    evidence: 0,
    coverage: null,
    itemsLinked: 0,
    itemsPractised: 0,
  },
  signals: [{ kind: 'no_material', reason: 'No cards or questions are linked yet.' }],
  priority: 0.7 * (14 / 9),
  exposure,
};

export const rollUp = { mastery: 0.5, readiness: 0.25, coverage: 0.5, practised: 1, total: 2 };

export const overview = {
  computedAt: now,
  overall: rollUp,
  modules: [
    {
      module: { id: MOD, code: 'COC251', title: 'Distributed Systems' },
      rollUp,
      topics: [],
      concepts: [paxosProgress, raftProgress],
    },
  ],
  unassigned: [],
};

export const weakAreas = {
  computedAt: now,
  items: [raftProgress],
  noMaterial: [{ id: PAXOS, name: 'Paxos' }],
};

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

export const notFound = () =>
  json(
    { type: 'urn:skb:problem:not_found', title: 'Not found', status: 404, code: 'not_found' },
    404,
  );
