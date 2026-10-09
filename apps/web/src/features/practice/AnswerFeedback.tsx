import type { AnswerResult, Question, QuestionResponse, SelfScore } from '@skb/core';
import { CheckCircle2, CircleDashed, ExternalLink, XCircle } from 'lucide-react';
import { Button, buttonClasses } from '../../components/Button';
import { cn } from '../../lib/cn';
import { locatorHref } from '../library/links';
import { CardMarkdown } from '../review/CardMarkdown';
import { SELF_GRADES, scoreLabel } from './format';

/**
 * What an answer earned and why (task 9.11): the key with each option's explanation, the model
 * answer and rubric for open questions, the explanation and the source. An answer waiting for its
 * grade asks the student to compare and grade it — once.
 */

function tone(score: number | null) {
  if (score === null) return 'border-info/40 bg-info-subtle text-info';
  if (score >= 1) return 'border-success/40 bg-success-subtle text-success';
  if (score <= 0) return 'border-danger/40 bg-danger-subtle text-danger';
  return 'border-warning/40 bg-warning-subtle text-warning';
}

function yourAnswer(response: QuestionResponse | null): string | null {
  if (!response) return null;
  switch (response.kind) {
    case 'true_false':
      return response.value ? 'True' : 'False';
    case 'numeric':
      return String(response.value);
    case 'mcq':
    case 'multi':
      return null;
    default:
      return response.text;
  }
}

function KeyView({
  question,
  response,
}: {
  question: Question;
  response: QuestionResponse | null;
}) {
  const { answer } = question;
  switch (answer.kind) {
    case 'mcq':
    case 'multi': {
      const chosen =
        response?.kind === 'mcq'
          ? [response.choice]
          : response?.kind === 'multi'
            ? response.choices
            : [];
      return (
        <ul aria-label="Options" className="space-y-1.5">
          {answer.options.map((option) => {
            const picked = chosen.includes(option.id);
            return (
              <li
                key={option.id}
                className={cn(
                  'rounded-md border px-3 py-2 text-sm',
                  option.correct
                    ? 'border-success/40'
                    : picked
                      ? 'border-danger/40'
                      : 'border-border',
                )}
              >
                <div className="flex items-start gap-2">
                  {option.correct ? (
                    <CheckCircle2
                      aria-label="Right"
                      size={16}
                      className="mt-0.5 shrink-0 text-success"
                    />
                  ) : picked ? (
                    <XCircle aria-label="Wrong" size={16} className="mt-0.5 shrink-0 text-danger" />
                  ) : (
                    <CircleDashed
                      aria-hidden="true"
                      size={16}
                      className="mt-0.5 shrink-0 text-muted"
                    />
                  )}
                  <CardMarkdown
                    content={option.text}
                    cardId={question.id}
                    className="min-w-0 flex-1"
                  />
                  {picked && <span className="shrink-0 text-xs text-muted">your choice</span>}
                </div>
                {option.explanation && (
                  <p className="mt-1 pl-6 text-xs text-muted">{option.explanation}</p>
                )}
              </li>
            );
          })}
        </ul>
      );
    }
    case 'true_false':
      return <p className="text-sm">The statement is {answer.value ? 'true' : 'false'}.</p>;
    case 'numeric': {
      const unit = answer.unit ? ` ${answer.unit}` : '';
      const tolerance =
        answer.tolerance.amount === 0
          ? ''
          : answer.tolerance.type === 'absolute'
            ? ` (± ${answer.tolerance.amount}${unit})`
            : ` (± ${Math.round(answer.tolerance.amount * 1000) / 10} %)`;
      return (
        <p className="text-sm">
          The answer is <strong>{`${answer.value}${unit}`}</strong>
          {tolerance}.
        </p>
      );
    }
    case 'short':
      return (
        <p className="text-sm">
          Accepted: <strong>{answer.accepted.join('; ')}</strong>
        </p>
      );
    default:
      return (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
            {answer.kind === 'code' ? 'Model solution' : 'Model answer'}
          </p>
          <CardMarkdown
            content={
              answer.kind === 'code'
                ? `\`\`\`${answer.language}\n${answer.model}\n\`\`\``
                : answer.model
            }
            cardId={question.id}
          />
          {question.rubric && (
            <>
              <p className="mt-3 mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                A good answer
              </p>
              <CardMarkdown content={question.rubric} cardId={question.id} />
            </>
          )}
        </div>
      );
  }
}

export function AnswerFeedback({
  result,
  onGrade,
  grading = false,
}: {
  result: AnswerResult;
  onGrade?(score: SelfScore): void;
  grading?: boolean;
}) {
  const { question } = result;
  const mine = yourAnswer(result.response);
  return (
    <section aria-label="Feedback" className="space-y-3">
      <p
        role="status"
        className={cn('rounded-md border px-3 py-2 text-sm font-medium', tone(result.score))}
      >
        {result.response === null ? 'Left blank' : scoreLabel(result.score)}
        {result.assisted && ' · with the hint'}
      </p>
      {mine !== null && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Your answer</p>
          <p className="whitespace-pre-wrap rounded-md bg-surface-sunken px-3 py-2 font-mono text-sm">
            {mine}
          </p>
        </div>
      )}
      <KeyView question={question} response={result.response} />
      {question.explanation && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Why</p>
          <CardMarkdown content={question.explanation} cardId={question.id} />
        </div>
      )}
      {question.locator && (
        <a
          href={locatorHref(question.locator)}
          target="_blank"
          rel="noopener"
          className={buttonClasses('secondary', 'sm')}
        >
          <ExternalLink aria-hidden="true" size={14} /> Source
        </a>
      )}
      {result.score === null && onGrade && (
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium">
            Compare with the answer above: how did you do?
          </legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {SELF_GRADES.map((grade) => (
              <Button
                key={grade.score}
                size="sm"
                disabled={grading}
                onClick={() => onGrade(grade.score)}
              >
                {grade.label}
              </Button>
            ))}
          </div>
        </fieldset>
      )}
    </section>
  );
}
