import type { AnswerResult, Attempt, SelfScore } from '@skb/core';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Kbd } from '../../components/Kbd';
import { ProgressBar } from '../../components/ProgressBar';
import { notifyError } from '../../lib/notify';
import { useAttemptCalls } from './api';
import { QuestionCard, type Submission } from './QuestionCard';

/** A practice quiz, one question at a time with feedback straight away (task 9.11). */
export function PracticeRunner({ attempt, onChanged }: { attempt: Attempt; onChanged(): void }) {
  const calls = useAttemptCalls();
  const [results, setResults] = useState<Record<string, AnswerResult>>(() =>
    Object.fromEntries(
      attempt.items.flatMap((item) => (item.answer ? [[item.prompt.id, item.answer]] : [])),
    ),
  );
  const firstOpen = attempt.items.findIndex((item) => item.answer === null);
  const [index, setIndex] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [busy, setBusy] = useState(false);
  const item = attempt.items[index];
  const total = attempt.items.length;
  const answered = Object.keys(results).length;
  const last = index >= total - 1;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      notifyError(reason);
    } finally {
      setBusy(false);
    }
  };
  const record = (result: AnswerResult) =>
    setResults((current) => ({ ...current, [result.questionId]: result }));

  const submit = (submission: Submission) =>
    item &&
    void run(async () => {
      record(
        await calls.answer(attempt.id, {
          questionId: item.prompt.id,
          response: submission.response,
          assisted: submission.assisted,
          durationMs: submission.durationMs,
          ...(submission.confidence ? { confidence: submission.confidence } : {}),
        }),
      );
    });
  const grade = (result: AnswerResult, score: SelfScore) =>
    void run(async () => record(await calls.grade(result.id, score)));
  const finish = () =>
    void run(async () => {
      await calls.finish(attempt.id);
      onChanged();
    });

  if (!item) return null;
  const result = results[item.prompt.id] ?? null;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ProgressBar
        value={total === 0 ? 0 : answered / total}
        label={`${answered} of ${total} answered`}
      />
      <QuestionCard
        key={item.prompt.id}
        prompt={item.prompt}
        label={`Question ${index + 1} of ${total}`}
        result={result}
        busy={busy}
        onSubmit={submit}
        onGrade={(score) => result && grade(result, score)}
        next={
          last ? (
            <Button variant="primary" autoFocus onClick={finish} loading={busy}>
              Finish and see the score <Kbd>Enter</Kbd>
            </Button>
          ) : (
            <Button variant="primary" autoFocus onClick={() => setIndex(index + 1)}>
              Next question <Kbd>Enter</Kbd>
            </Button>
          )
        }
      />
      {!result && (
        <div className="flex justify-center gap-2">
          {!last && (
            <Button size="sm" variant="ghost" onClick={() => setIndex(index + 1)}>
              Skip for now
            </Button>
          )}
          {index > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setIndex(index - 1)}>
              Previous
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
