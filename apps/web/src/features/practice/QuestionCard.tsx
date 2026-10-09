import type { AnswerResult, QuestionPrompt, QuestionResponse, SelfScore } from '@skb/core';
import { ExternalLink, Lightbulb } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button, buttonClasses } from '../../components/Button';
import { Card } from '../../components/Card';
import { Kbd } from '../../components/Kbd';
import { cn } from '../../lib/cn';
import { locatorHref } from '../library/links';
import { CardMarkdown } from '../review/CardMarkdown';
import { type AcceptedGrade, AnswerFeedback } from './AnswerFeedback';
import { KIND_LABELS } from './format';
import { isComplete, ResponseInput } from './ResponseInput';

/**
 * One question being answered (practice quizzes and Learn): the stem, the input for its kind, an
 * optional hint (which marks the answer as helped), how sure you are, then the feedback.
 */

const CONFIDENCE = [
  { value: 1, label: 'Guessing' },
  { value: 2, label: 'Unsure' },
  { value: 3, label: 'Sure' },
] as const;

export interface Submission {
  response: QuestionResponse;
  assisted: boolean;
  confidence?: number;
  durationMs: number;
}

export function QuestionCard({
  prompt,
  label,
  result,
  busy,
  onSubmit,
  onGrade,
  next,
}: {
  prompt: QuestionPrompt;
  /** e.g. "Question 3 of 10" or the concept and rung in Learn. */
  label: ReactNode;
  result: AnswerResult | null;
  busy: boolean;
  onSubmit(submission: Submission): void;
  onGrade(score: SelfScore, accepted?: AcceptedGrade): void;
  /** What moves on once the answer is graded. */
  next: ReactNode;
}) {
  const [response, setResponse] = useState<QuestionResponse | null>(null);
  const [hinted, setHinted] = useState(false);
  const [confidence, setConfidence] = useState<number | undefined>();
  const [startedAt] = useState(() => Date.now());
  const answered = result !== null;
  const textual = ['explain', 'derivation', 'code'].includes(prompt.kind);
  const ready = isComplete(response) && !busy;

  const submit = () => {
    if (!isComplete(response) || busy) return;
    onSubmit({
      response,
      assisted: hinted,
      confidence,
      durationMs: Math.min(86_400_000, Date.now() - startedAt),
    });
  };

  return (
    <Card className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {label}
        <Badge>{KIND_LABELS[prompt.kind]}</Badge>
        {prompt.concepts.map((concept) => (
          <span key={concept.id}>{concept.name}</span>
        ))}
      </div>
      <section aria-label="Question">
        <CardMarkdown content={prompt.stem} cardId={prompt.id} />
      </section>
      {!answered && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          // Enter checks from an option or a field; Ctrl+Enter from a long written answer too.
          onKeyDown={(event) => {
            const target = event.target;
            const plain =
              !(target instanceof HTMLTextAreaElement) && !(target instanceof HTMLButtonElement);
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey || plain)) {
              event.preventDefault();
              submit();
            }
          }}
        >
          <ResponseInput prompt={prompt} value={response} onChange={setResponse} disabled={busy} />
          {prompt.hint &&
            (hinted ? (
              <p className="rounded-md bg-surface-sunken px-3 py-2 text-sm">
                <Lightbulb aria-hidden="true" size={14} className="mr-1 inline" />
                {prompt.hint}
              </p>
            ) : (
              <Button type="button" size="sm" onClick={() => setHinted(true)}>
                <Lightbulb aria-hidden="true" size={14} /> Show hint (counts as helped)
              </Button>
            ))}
          <fieldset className="flex flex-wrap items-center gap-2 text-sm">
            <legend className="sr-only">How sure are you?</legend>
            <span className="text-muted" aria-hidden="true">
              How sure are you?
            </span>
            {CONFIDENCE.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs',
                  confidence === option.value
                    ? 'border-accent bg-accent-subtle'
                    : 'border-border-strong hover:bg-surface-hover',
                )}
              >
                <input
                  type="radio"
                  name={`confidence-${prompt.id}`}
                  className="sr-only"
                  checked={confidence === option.value}
                  onChange={() => setConfidence(option.value)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary" disabled={!ready} loading={busy}>
              Check <Kbd>{textual ? 'Ctrl+Enter' : 'Enter'}</Kbd>
            </Button>
            {prompt.locator && (
              <a
                href={locatorHref(prompt.locator)}
                target="_blank"
                rel="noopener"
                className={buttonClasses('ghost', 'sm')}
                onClick={() => setHinted(true)}
              >
                <ExternalLink aria-hidden="true" size={14} /> Source (counts as helped)
              </a>
            )}
          </div>
        </form>
      )}
      {result && (
        <>
          <AnswerFeedback result={result} onGrade={onGrade} grading={busy} />
          {result.score !== null && next}
        </>
      )}
    </Card>
  );
}
