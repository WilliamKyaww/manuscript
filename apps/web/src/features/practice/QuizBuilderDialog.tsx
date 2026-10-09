import { QUESTION_KINDS, type QuestionKind, type QuizInput } from '@skb/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useId, useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { formatCount } from '../../lib/format';
import { describeError } from '../../lib/notify';
import { moduleQuery, modulesQuery } from '../learning/api';
import { Field, FormError, selectClasses } from '../learning/Field';
import { quizPreviewQuery, usePracticeActions } from './api';
import { KIND_LABELS } from './format';

/**
 * Building a practice quiz or mock exam (task 9.04): what it covers (module, lectures, topics,
 * tags), which kinds and how hard, how many questions — and for a mock exam, the assessment it
 * rehearses and the time allowed. Shows how many questions match before you start.
 */

type Kind = 'practice' | 'mock_exam';

const chipClasses = (on: boolean) =>
  cn(
    'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs',
    on ? 'border-accent bg-accent-subtle' : 'border-border-strong hover:bg-surface-hover',
  );

function Chips<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  value: readonly T[];
  onChange(next: T[]): void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const on = value.includes(option.value);
          return (
            <label key={option.value} className={chipClasses(on)}>
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={() =>
                  onChange(on ? value.filter((v) => v !== option.value) : [...value, option.value])
                }
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function QuizBuilderDialog({
  initialKind = 'practice',
  initialModuleId,
  onClose,
}: {
  initialKind?: Kind;
  initialModuleId?: string;
  onClose(): void;
}) {
  const api = useApi();
  const navigate = useNavigate();
  const actions = usePracticeActions();
  const formId = useId();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [title, setTitle] = useState('');
  const [moduleId, setModuleId] = useState(initialModuleId ?? '');
  const [lectureIds, setLectureIds] = useState<string[]>([]);
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [tags, setTags] = useState('');
  const [kinds, setKinds] = useState<QuestionKind[]>([]);
  const [count, setCount] = useState(10);
  const [assessmentId, setAssessmentId] = useState('');
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const modules = useQuery(modulesQuery(api));
  const module = useQuery({ ...moduleQuery(api, moduleId), enabled: moduleId !== '' });

  const tagList = tags
    .split(/[\s,]+/u)
    .map((tag) => tag.replace(/^#/u, ''))
    .filter(Boolean);
  const config: QuizInput['config'] = {
    scope: {
      ...(moduleId ? { moduleId: moduleId } : {}),
      ...(lectureIds.length ? { lectureIds: lectureIds } : {}),
      ...(topicIds.length ? { topicIds: topicIds } : {}),
      ...(tagList.length ? { tags: tagList } : {}),
    },
    count,
    ...(kinds.length ? { kinds } : {}),
    ...(kind === 'mock_exam' && assessmentId ? { assessmentId: assessmentId } : {}),
    ...(kind === 'mock_exam' && Number(minutes) > 0 ? { timeLimitMinutes: Number(minutes) } : {}),
  };
  const preview = useQuery({
    ...quizPreviewQuery(api, config),
    placeholderData: keepPreviousData,
  });
  const available = preview.data?.available;

  const busy = actions.createQuiz.isPending || actions.startAttempt.isPending;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const quiz = await actions.createQuiz.mutateAsync({
        kind,
        config,
        ...(title.trim() ? { title: title.trim() } : {}),
      });
      const attempt = await actions.startAttempt.mutateAsync(quiz.id);
      await navigate({ to: '/practice/attempts/$attemptId', params: { attemptId: attempt.id } });
    } catch (reason) {
      setError(describeError(reason).description);
    }
  };

  const assessments = (module.data?.assessments ?? []).filter((a) => a.status === 'planned');
  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={kind === 'mock_exam' ? 'New mock exam' : 'New practice quiz'}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted" aria-live="polite">
            {available === undefined
              ? 'Counting questions…'
              : `${formatCount(available, 'question')} match${available === 1 ? 'es' : ''}`}
            {available !== undefined && available > count && ` · ${count} will be chosen`}
          </p>
          <div className="flex gap-2">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="primary"
              loading={busy}
              disabled={available === 0}
            >
              Start
            </Button>
          </div>
        </div>
      }
    >
      <form id={formId} className="space-y-4" onSubmit={submit}>
        <fieldset className="flex gap-1">
          <legend className="mb-1 text-sm font-medium">Kind</legend>
          {(
            [
              ['practice', 'Practice quiz — feedback as you go'],
              ['mock_exam', 'Mock exam — timed, feedback at the end'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={cn(chipClasses(kind === value), 'px-3 py-1.5 text-sm')}>
              <input
                type="radio"
                name="quiz-kind"
                className="sr-only"
                checked={kind === value}
                onChange={() => setKind(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Module" className="min-w-48 flex-1">
            {(id) => (
              <select
                id={id}
                className={selectClasses}
                value={moduleId}
                onChange={(event) => {
                  setModuleId(event.target.value);
                  setLectureIds([]);
                  setTopicIds([]);
                  setAssessmentId('');
                }}
              >
                <option value="">Any module</option>
                {(modules.data?.modules ?? []).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.code} — {option.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Questions" className="w-28">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={1}
                max={200}
                value={count}
                onChange={(event) =>
                  setCount(Math.max(1, Math.min(200, Number(event.target.value) || 1)))
                }
              />
            )}
          </Field>
          <Field label="Title (optional)" className="min-w-48 flex-1">
            {(id) => (
              <Input id={id} value={title} onChange={(event) => setTitle(event.target.value)} />
            )}
          </Field>
        </div>
        {module.data && (
          <>
            <Chips
              legend="Lectures (any when none chosen)"
              options={module.data.lectures.map((lecture) => ({
                value: lecture.id as string,
                label: `${lecture.key} ${lecture.title}`,
              }))}
              value={lectureIds}
              onChange={setLectureIds}
            />
            <Chips
              legend="Topics (any when none chosen)"
              options={module.data.topics.map((topic) => ({
                value: topic.id as string,
                label: topic.title,
              }))}
              value={topicIds}
              onChange={setTopicIds}
            />
          </>
        )}
        <Chips
          legend="Kinds (all when none chosen)"
          options={QUESTION_KINDS.map((value) => ({ value, label: KIND_LABELS[value] }))}
          value={kinds}
          onChange={setKinds}
        />
        <Field label="Tags" hint="Questions with any of these tags (optional).">
          {(id, hint) => (
            <Input
              id={id}
              aria-describedby={hint}
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          )}
        </Field>
        {kind === 'mock_exam' && (
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Rehearses" className="min-w-48 flex-1">
              {(id) => (
                <select
                  id={id}
                  className={selectClasses}
                  value={assessmentId}
                  disabled={!moduleId}
                  onChange={(event) => setAssessmentId(event.target.value)}
                >
                  <option value="">
                    {moduleId ? 'No particular assessment' : 'Choose a module first'}
                  </option>
                  {assessments.map((assessment) => (
                    <option key={assessment.id} value={assessment.id}>
                      {assessment.title}
                      {assessment.durationMinutes ? ` (${assessment.durationMinutes} min)` : ''}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field
              label="Minutes"
              hint="Blank: the assessment's duration, or untimed."
              className="w-40"
            >
              {(id, hint) => (
                <Input
                  id={id}
                  aria-describedby={hint}
                  type="number"
                  min={1}
                  max={600}
                  value={minutes}
                  onChange={(event) => setMinutes(event.target.value)}
                />
              )}
            </Field>
          </div>
        )}
        <FormError error={error} />
      </form>
    </Dialog>
  );
}
