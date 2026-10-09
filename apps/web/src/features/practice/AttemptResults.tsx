import type { Attempt, SelfScore } from '@skb/core';
import { useNavigate } from '@tanstack/react-router';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { formatCount } from '../../lib/format';
import { notifyError } from '../../lib/notify';
import { CardMarkdown } from '../review/CardMarkdown';
import { AnswerFeedback } from './AnswerFeedback';
import { useAttemptCalls, usePracticeActions } from './api';
import { percent } from './format';

/** A finished attempt: the score, every answer with its feedback, grading what waits, retaking. */
export function AttemptResults({ attempt, onChanged }: { attempt: Attempt; onChanged(): void }) {
  const calls = useAttemptCalls();
  const actions = usePracticeActions();
  const navigate = useNavigate();
  const [grading, setGrading] = useState<string | null>(null);
  const { counts } = attempt;

  const grade = async (answerId: string, score: SelfScore) => {
    setGrading(answerId);
    try {
      await calls.grade(answerId, score);
      onChanged();
    } catch (reason) {
      notifyError(reason);
    } finally {
      setGrading(null);
    }
  };

  const retake = async () => {
    try {
      const quiz = await actions.retake.mutateAsync(attempt.id);
      const next = await actions.startAttempt.mutateAsync(quiz.id);
      await navigate({ to: '/practice/attempts/$attemptId', params: { attemptId: next.id } });
    } catch (reason) {
      notifyError(reason);
    }
  };

  const wrong = attempt.items.filter((item) => item.answer && (item.answer.score ?? 1) < 1).length;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card className="grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted">Score</p>
          <p className="text-2xl font-semibold tabular-nums" data-testid="attempt-score">
            {percent(attempt.score)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Right</p>
          <p className="text-2xl font-semibold tabular-nums">
            {counts.correct} of {counts.total}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted">Waiting for your grade</p>
          <p className="text-2xl font-semibold tabular-nums">{counts.pending}</p>
          {counts.pending > 0 && (
            <p className="text-xs text-muted">The score counts them once graded.</p>
          )}
        </div>
      </Card>
      {wrong > 0 && (
        <Button onClick={() => void retake()} loading={actions.retake.isPending}>
          <RotateCcw aria-hidden="true" size={14} /> Retake the {formatCount(wrong, 'question')} not
          fully right
        </Button>
      )}
      <ol className="space-y-4">
        {attempt.items.map((item, index) => (
          <li key={`${item.prompt.id}-${item.ordinal}`}>
            <Card className="space-y-3 p-5">
              <div className="flex gap-2">
                <span className="font-medium text-muted">{index + 1}.</span>
                <CardMarkdown
                  content={item.prompt.stem}
                  cardId={item.prompt.id}
                  className="min-w-0 flex-1"
                />
              </div>
              {item.answer ? (
                <AnswerFeedback
                  result={item.answer}
                  grading={grading === item.answer.id}
                  onGrade={(score) => item.answer && void grade(item.answer.id, score)}
                />
              ) : (
                <p className="text-sm text-muted">Not answered.</p>
              )}
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
