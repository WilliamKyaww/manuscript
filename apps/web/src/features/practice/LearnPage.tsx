import type { AnswerResult, LearnState, SelfScore } from '@skb/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { CheckCircle2, Circle } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button, buttonClasses } from '../../components/Button';
import { Card } from '../../components/Card';
import { Kbd } from '../../components/Kbd';
import { Page } from '../../components/Page';
import { ProgressBar } from '../../components/ProgressBar';
import { ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { formatCount } from '../../lib/format';
import { notifyError } from '../../lib/notify';
import type { AcceptedGrade } from './AnswerFeedback';
import { learnQuery, practiceKeys, useAttemptCalls } from './api';
import { QuestionCard, type Submission } from './QuestionCard';

/**
 * A Learn session (task 9.09, learning-system.md §6): the engine chooses each question — the most
 * pressing concept, at the rung of the ladder it has reached — until every concept is secure
 * (two right answers at recall or above) or time is up.
 */

const LEVEL_LABELS = { recognition: 'Recognise', recall: 'Recall', production: 'Explain' } as const;

const DONE_TEXT: Record<NonNullable<LearnState['done']>, string> = {
  secure: 'Every concept is secure for this session.',
  time: 'Time is up.',
  finished: 'You ended the session.',
};

function ConceptList({ state }: { state: LearnState }) {
  return (
    <ul aria-label="Concepts in this session" className="space-y-1.5 text-sm">
      {state.concepts.map((row) => (
        <li key={row.concept.id} className="flex items-center gap-2">
          {row.secure ? (
            <CheckCircle2 aria-label="Secure" size={16} className="shrink-0 text-success" />
          ) : (
            <Circle aria-label="Not secure yet" size={16} className="shrink-0 text-muted" />
          )}
          <Link
            to="/concepts/$conceptId"
            params={{ conceptId: row.concept.id }}
            className="min-w-0 flex-1 truncate hover:underline"
          >
            {row.concept.name}
          </Link>
          <span className="text-xs text-muted">
            {LEVEL_LABELS[row.level]} · {row.correct}/{row.shown}
          </span>
        </li>
      ))}
      {state.withoutMaterial.length > 0 && (
        <li className="pt-2 text-xs text-muted">
          No questions yet for {state.withoutMaterial.map((concept) => concept.name).join(', ')}.
        </li>
      )}
    </ul>
  );
}

export function LearnPage() {
  const { attemptId } = useParams({ from: '/practice/learn/$attemptId' });
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const calls = useAttemptCalls();
  const learn = useQuery(learnQuery(api, attemptId));
  // The answer just given stays on screen until "Continue".
  const [shown, setShown] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const state = learn.data;

  const refresh = () => queryClient.invalidateQueries({ queryKey: practiceKeys.learn(attemptId) });
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      notifyError(reason);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const current = state?.current ?? null;
  const pending = state?.last && state.last.score === null ? state.last : null;
  const result = shown ?? pending;
  const submit = (submission: Submission) =>
    current &&
    void run(async () => {
      setShown(
        await calls.answer(attemptId, {
          questionId: current.prompt.id,
          conceptId: current.concept.id,
          response: submission.response,
          assisted: submission.assisted,
          durationMs: submission.durationMs,
          ...(submission.confidence ? { confidence: submission.confidence } : {}),
        }),
      );
      await refresh();
    });
  const grade = (answer: AnswerResult, score: SelfScore, accepted?: AcceptedGrade) =>
    void run(async () => {
      setShown(await calls.grade(answer.id, score, accepted));
      await refresh();
    });
  const finish = () =>
    void run(async () => {
      await calls.finish(attemptId);
      await refresh();
      await navigate({ to: '/practice/attempts/$attemptId', params: { attemptId } });
    });

  const secure = state?.concepts.filter((row) => row.secure).length ?? 0;
  const total = state?.concepts.length ?? 0;

  return (
    <Page
      title={state?.title ?? 'Learn'}
      breadcrumbs={[{ label: 'Practice', to: '/practice' }, { label: state?.title ?? 'Learn' }]}
      description={
        state
          ? `${formatCount(state.answered, 'answer')} · ${secure} of ${total} concepts secure`
          : undefined
      }
      actions={
        state &&
        !state.finishedAt && (
          <Button size="sm" onClick={finish} disabled={busy}>
            End session
          </Button>
        )
      }
    >
      {learn.isPending && <LoadingState label="Preparing the session" />}
      {learn.isError && (
        <ErrorState message="This session could not be loaded." onRetry={() => learn.refetch()} />
      )}
      {state && (
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_16rem]">
          <div className="space-y-4">
            <ProgressBar
              value={total ? secure / total : 0}
              label={`${secure} of ${total} secure`}
            />
            {state.done && !result ? (
              <Card className="space-y-3 p-6">
                <p className="text-base font-medium">{DONE_TEXT[state.done]}</p>
                {state.finishedAt ? (
                  <Link
                    to="/practice/attempts/$attemptId"
                    params={{ attemptId }}
                    className={buttonClasses('primary')}
                  >
                    See every answer
                  </Link>
                ) : (
                  <Button variant="primary" autoFocus onClick={finish} loading={busy}>
                    Finish and see the summary <Kbd>Enter</Kbd>
                  </Button>
                )}
              </Card>
            ) : (
              <SessionQuestion
                state={state}
                result={result}
                busy={busy}
                onSubmit={submit}
                onGrade={(score, accepted) => result && grade(result, score, accepted)}
                onContinue={() => setShown(null)}
              />
            )}
          </div>
          <aside aria-label="Session progress">
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-semibold">Concepts</h2>
              <ConceptList state={state} />
            </Card>
          </aside>
        </div>
      )}
    </Page>
  );
}

function SessionQuestion({
  state,
  result,
  busy,
  onSubmit,
  onGrade,
  onContinue,
}: {
  state: LearnState;
  result: AnswerResult | null;
  busy: boolean;
  onSubmit(submission: Submission): void;
  onGrade(score: SelfScore, accepted?: AcceptedGrade): void;
  onContinue(): void;
}) {
  // An answer on screen shows its own question (from the result); otherwise the current one.
  const prompt = result
    ? {
        id: result.question.id,
        kind: result.question.kind,
        stem: result.question.stem,
        options:
          result.question.answer.kind === 'mcq' || result.question.answer.kind === 'multi'
            ? result.question.answer.options.map((option) => ({ id: option.id, text: option.text }))
            : null,
        unit: result.question.answer.kind === 'numeric' ? result.question.answer.unit : null,
        language: result.question.answer.kind === 'code' ? result.question.answer.language : null,
        hint: result.question.hint,
        difficulty: result.question.difficulty,
        concepts: result.question.concepts,
        locator: result.question.locator,
      }
    : state.current?.prompt;
  if (!prompt) return <LoadingState label="Choosing the next question" />;
  const level = state.current?.level;
  return (
    <QuestionCard
      // A fresh card for each question asked, even when the same one comes round again.
      key={result ? `result-${result.id}` : `ask-${state.answered}-${prompt.id}`}
      prompt={prompt}
      label={
        level && !result ? (
          <Badge tone="info">{LEVEL_LABELS[level]}</Badge>
        ) : (
          <Badge>Answered</Badge>
        )
      }
      result={result}
      busy={busy}
      onSubmit={onSubmit}
      onGrade={onGrade}
      next={
        <Button variant="primary" autoFocus onClick={onContinue}>
          Continue <Kbd>Enter</Kbd>
        </Button>
      }
    />
  );
}
