import type { Attempt, QuestionResponse } from '@skb/core';
import { Timer } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Dialog } from '../../components/Dialog';
import { cn } from '../../lib/cn';
import { formatCount } from '../../lib/format';
import { notifyError } from '../../lib/notify';
import { CardMarkdown } from '../review/CardMarkdown';
import { useAttemptCalls } from './api';
import { isComplete, ResponseInput } from './ResponseInput';

/**
 * A mock exam (task 9.12): every question on one page, a clock, no feedback until it is
 * submitted. Responses are saved as a draft as you go; when time runs out the exam is submitted
 * as it stands.
 */

const pad = (value: number) => String(value).padStart(2, '0');
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds % 60)}`
    : `${minutes}:${pad(seconds % 60)}`;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export function MockExamRunner({ attempt, onChanged }: { attempt: Attempt; onChanged(): void }) {
  const calls = useAttemptCalls();
  const [responses, setResponses] = useState<Record<string, QuestionResponse>>(attempt.draft);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitted = useRef(false);
  const edited = useRef(false);
  const deadline = attempt.deadline ? Date.parse(attempt.deadline) : null;
  const now = useNow(deadline !== null);
  const remaining = deadline === null ? null : deadline - now;

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    try {
      await calls.submit(attempt.id, responses);
      onChanged();
    } catch (reason) {
      submitted.current = false;
      notifyError(reason);
    } finally {
      setSubmitting(false);
      setConfirming(false);
    }
  }, [attempt.id, calls, onChanged, responses]);

  // Keep a draft, a moment after each change.
  useEffect(() => {
    if (!edited.current) return;
    const timer = window.setTimeout(() => {
      calls.saveDraft(attempt.id, responses).catch(() => undefined);
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [attempt.id, calls, responses]);

  useEffect(() => {
    if (remaining !== null && remaining <= 0) void submit();
  }, [remaining, submit]);

  const answered = attempt.items.filter((item) =>
    isComplete(responses[item.prompt.id] ?? null),
  ).length;
  const total = attempt.items.length;
  const low = remaining !== null && remaining < 5 * 60_000;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm">
          {answered} of {total} answered
        </p>
        {remaining !== null && (
          <p
            className={cn(
              'flex items-center gap-1.5 font-mono text-lg tabular-nums',
              low && 'text-danger',
            )}
          >
            <Timer aria-hidden="true" size={18} />
            <span role="timer" aria-label="Time left">
              {formatClock(remaining)}
            </span>
          </p>
        )}
        <Button variant="primary" onClick={() => setConfirming(true)} loading={submitting}>
          Submit
        </Button>
      </Card>
      <ol className="space-y-4">
        {attempt.items.map((item, index) => (
          <li key={item.prompt.id}>
            <Card className="space-y-3 p-5">
              <div className="flex gap-2">
                <span className="font-medium text-muted">{index + 1}.</span>
                <CardMarkdown
                  content={item.prompt.stem}
                  cardId={item.prompt.id}
                  className="min-w-0 flex-1"
                />
              </div>
              <ResponseInput
                prompt={item.prompt}
                name={`exam-${item.prompt.id}`}
                value={responses[item.prompt.id] ?? null}
                disabled={submitting}
                onChange={(next) => {
                  edited.current = true;
                  setResponses((current) => ({ ...current, [item.prompt.id]: next }));
                }}
              />
            </Card>
          </li>
        ))}
      </ol>
      {confirming && (
        <Dialog
          open
          onOpenChange={(next) => !next && setConfirming(false)}
          title="Submit the mock exam?"
          size="sm"
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button onClick={() => setConfirming(false)}>Keep going</Button>
              <Button variant="primary" onClick={() => void submit()} loading={submitting}>
                Submit
              </Button>
            </div>
          }
        >
          <p className="text-sm">
            {answered === total
              ? 'Every question has an answer.'
              : `${formatCount(total - answered, 'question')} without an answer will score 0.`}{' '}
            Written answers are graded by you afterwards.
          </p>
        </Dialog>
      )}
    </div>
  );
}
