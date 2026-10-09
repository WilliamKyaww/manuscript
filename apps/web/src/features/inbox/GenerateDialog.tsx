import type { GenerationRequest, GenerationScope, GenerationTask } from '@skb/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CircleAlert, Sparkles } from 'lucide-react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Button, buttonClasses } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { ProgressBar } from '../../components/ProgressBar';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { describeError } from '../../lib/notify';
import { Chips, chipClasses, Field, FormError, selectClasses } from '../learning/Field';
import { KIND_LABELS } from '../practice/format';
import { cardSetsQuery } from '../review/api';
import { estimateQuery, useStartGeneration } from './api';
import { useGenerationJobs } from './generation-jobs';

/**
 * Generating from material (task 11.12): flashcards, questions, a note or concepts, from a lecture,
 * a source (or a range of its pages or slides), a note or a selection. The estimate — passages,
 * tokens, an approximate cost and anything that stops it — is shown before anything is spent; the
 * job then runs in the background and its results wait in the Inbox.
 */

const TASKS: { value: GenerationTask; label: string; noun: string }[] = [
  { value: 'cards', label: 'Flashcards', noun: 'cards' },
  { value: 'questions', label: 'Questions', noun: 'questions' },
  { value: 'note', label: 'Lecture notes', noun: 'note' },
  { value: 'concepts', label: 'Concepts', noun: 'concepts' },
];

const QUESTION_KINDS = ['mcq', 'multi', 'true_false', 'numeric', 'short', 'explain'] as const;
type QuestionKind = (typeof QUESTION_KINDS)[number];

const money = (value: number) => (value < 0.01 ? 'under $0.01' : `about $${value.toFixed(2)}`);
const tokens = (value: number) => value.toLocaleString('en-GB');

export function GenerateDialog({
  scope: initialScope,
  title,
  initialTask = 'cards',
  pageCount,
  onClose,
}: {
  scope: GenerationScope;
  /** What the material is: "Lecture 3 — Consensus", a source's title, "the selection". */
  title: string;
  initialTask?: GenerationTask;
  /** Pages or slides of a source, to offer a range. */
  pageCount?: number | null;
  onClose(): void;
}) {
  const api = useApi();
  const formId = useId();
  const [task, setTask] = useState<GenerationTask>(initialTask);
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<'easy' | 'mixed' | 'hard'>('mixed');
  const [focus, setFocus] = useState('');
  const [cardKinds, setCardKinds] = useState<('basic' | 'cloze')[]>(['basic', 'cloze']);
  const [questionKinds, setQuestionKinds] = useState<QuestionKind[]>(['mcq', 'short', 'explain']);
  const [setId, setSetId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const start = useStartGeneration();
  const track = useGenerationJobs((state) => state.track);
  const job = useGenerationJobs((state) => (jobId ? state.jobs[jobId]?.job : undefined));
  const sets = useQuery({ ...cardSetsQuery(api), enabled: task === 'cards' });

  const range = (value: string) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : undefined;
  };
  const scope: GenerationScope =
    initialScope.kind === 'source'
      ? {
          kind: 'source',
          sourceId: initialScope.sourceId,
          ...(range(from) ? { from: range(from) } : {}),
          ...(range(to) ? { to: range(to) } : {}),
        }
      : initialScope;
  const request: GenerationRequest = {
    task,
    scope,
    count: task === 'note' ? 1 : Math.min(50, Math.max(1, count)),
    difficulty,
    focus: focus.trim(),
    ...(task === 'cards' ? { cardKinds } : {}),
    ...(task === 'questions' ? { questionKinds } : {}),
    ...(task === 'cards' && setId ? { setId } : {}),
  };
  // Typing a count or a range should not ask for an estimate per keystroke.
  const [debounced, setDebounced] = useState(request);
  const key = JSON.stringify(request);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key stands for the request.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(request), 300);
    return () => clearTimeout(timer);
  }, [key]);
  const estimate = useQuery({
    ...estimateQuery(api, debounced),
    placeholderData: keepPreviousData,
    enabled: jobId === null,
  });
  const noun = TASKS.find((option) => option.value === task)?.noun ?? task;
  const label = `${TASKS.find((option) => option.value === task)?.label ?? 'Generation'} from ${title}`;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    start.mutate(request, {
      onSuccess: (started) => {
        track(started, label);
        setJobId(started.id);
      },
      onError: (reason) => setError(describeError(reason).description),
    });
  };

  const problem = estimate.data?.problem ?? null;
  const running = job && (job.status === 'queued' || job.status === 'running');
  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="Generate with AI"
      description={`From ${title}. Everything generated waits in the Inbox until you accept it.`}
      size="lg"
      footer={
        jobId ? (
          <div className="flex w-full items-center justify-end gap-2">
            <Button type="button" onClick={onClose}>
              {running ? 'Close (it keeps going)' : 'Close'}
            </Button>
            {job?.status === 'succeeded' && (
              <Link to="/inbox" className={buttonClasses('primary')} onClick={onClose}>
                Open Inbox
              </Link>
            )}
          </div>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <EstimateLine estimate={estimate.data} pending={estimate.isPending} noun={noun} />
            <div className="flex gap-2">
              <Button type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                form={formId}
                variant="primary"
                loading={start.isPending}
                disabled={Boolean(problem) || estimate.isPending}
              >
                <Sparkles aria-hidden="true" size={16} />
                Generate
              </Button>
            </div>
          </div>
        )
      }
    >
      {jobId ? (
        <JobState job={job} />
      ) : (
        <form id={formId} className="space-y-4" onSubmit={submit}>
          <fieldset className="flex flex-wrap gap-1">
            <legend className="mb-1 text-sm font-medium">What to make</legend>
            {TASKS.map((option) => (
              <label
                key={option.value}
                className={cn(chipClasses(task === option.value), 'px-3 py-1.5 text-sm')}
              >
                <input
                  type="radio"
                  name="generation-task"
                  className="sr-only"
                  checked={task === option.value}
                  onChange={() => setTask(option.value)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap items-end gap-3">
            {initialScope.kind === 'source' && (
              <>
                <Field label="From page or slide" className="w-40">
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      min={1}
                      max={pageCount ?? undefined}
                      placeholder="1"
                      value={from}
                      onChange={(event) => setFrom(event.target.value)}
                    />
                  )}
                </Field>
                <Field label="To" className="w-28">
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      min={1}
                      max={pageCount ?? undefined}
                      placeholder={pageCount ? String(pageCount) : 'end'}
                      value={to}
                      onChange={(event) => setTo(event.target.value)}
                    />
                  )}
                </Field>
              </>
            )}
            {task !== 'note' && (
              <Field label={task === 'concepts' ? 'At most' : 'How many'} className="w-28">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    max={50}
                    value={count}
                    onChange={(event) => setCount(Number(event.target.value) || 1)}
                  />
                )}
              </Field>
            )}
            {(task === 'cards' || task === 'questions') && (
              <Field label="Difficulty" className="w-40">
                {(id) => (
                  <select
                    id={id}
                    className={selectClasses}
                    value={difficulty}
                    onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}
                  >
                    <option value="easy">Easy</option>
                    <option value="mixed">Mixed</option>
                    <option value="hard">Hard</option>
                  </select>
                )}
              </Field>
            )}
            {task === 'cards' && (
              <Field label="Card set" className="min-w-48 flex-1">
                {(id) => (
                  <select
                    id={id}
                    className={selectClasses}
                    value={setId}
                    onChange={(event) => setSetId(event.target.value)}
                  >
                    <option value="">A set named after the material</option>
                    {(sets.data?.sets ?? []).map((set) => (
                      <option key={set.id} value={set.id}>
                        {set.title}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
          </div>
          {task === 'cards' && (
            <Chips
              legend="Card kinds"
              options={[
                { value: 'basic', label: 'Question and answer' },
                { value: 'cloze', label: 'Cloze deletion' },
              ]}
              value={cardKinds}
              onChange={(next) => next.length && setCardKinds(next)}
            />
          )}
          {task === 'questions' && (
            <Chips
              legend="Question kinds"
              options={QUESTION_KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }))}
              value={questionKinds}
              onChange={(next) => next.length && setQuestionKinds(next)}
            />
          )}
          <Field
            label="Focus (optional)"
            hint="What to concentrate on, in your words — “the failure cases”, “definitions for the exam”."
          >
            {(id, describedBy) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                maxLength={300}
                value={focus}
                onChange={(event) => setFocus(event.target.value)}
              />
            )}
          </Field>
          {problem && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm"
            >
              <CircleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-warning" />
              <span>
                {problem}{' '}
                {/AI|provider|model|budget/iu.test(problem) && (
                  <Link to="/settings" className="underline" onClick={onClose}>
                    Settings → AI
                  </Link>
                )}
              </span>
            </p>
          )}
          {estimate.data?.truncated && (
            <p className="text-sm text-muted">
              The material is longer than the AI may read at once, so only its first part is used.
              Choose a range to work on the rest.
            </p>
          )}
          <FormError error={error} />
        </form>
      )}
    </Dialog>
  );
}

function EstimateLine({
  estimate,
  pending,
  noun,
}: {
  estimate:
    | {
        passages: number;
        inputTokens: number;
        outputTokens: number;
        cost: number | null;
        model: string | null;
      }
    | undefined;
  pending: boolean;
  noun: string;
}) {
  if (pending || !estimate) return <p className="text-sm text-muted">Estimating…</p>;
  const cost = estimate.cost === null ? 'cost unknown (no prices set)' : money(estimate.cost);
  return (
    <p className="text-sm text-muted" aria-live="polite">
      {estimate.passages} passage{estimate.passages === 1 ? '' : 's'} · about{' '}
      {tokens(estimate.inputTokens + estimate.outputTokens)} tokens for the {noun} · {cost}
      {estimate.model && <span className="block text-xs">{estimate.model}</span>}
    </p>
  );
}

function JobState({
  job,
}: {
  job: ReturnType<typeof useGenerationJobs.getState>['jobs'][string]['job'] | undefined;
}) {
  if (!job || job.status === 'queued' || job.status === 'running')
    return (
      <div className="space-y-2" aria-live="polite">
        <ProgressBar value={job?.progress ?? null} label={job?.message ?? 'Waiting to start'} />
        <p className="text-sm text-muted">
          This runs in the background: you can close this and keep working. You will be told when it
          is done.
        </p>
      </div>
    );
  if (job.status === 'succeeded')
    return (
      <p role="status" className="rounded-md bg-success-subtle px-3 py-2 text-sm text-success">
        {job.message ?? 'Done.'}
      </p>
    );
  return (
    <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
      {job.status === 'cancelled'
        ? 'The generation was cancelled.'
        : (job.error ?? 'The generation failed.')}
    </p>
  );
}
