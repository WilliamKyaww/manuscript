import {
  answerProblem,
  QUESTION_KINDS,
  type Question,
  type QuestionAnswer,
  type QuestionKind,
} from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useId, useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { useApi } from '../../lib/api/context';
import { describeError, notifySuccess } from '../../lib/notify';
import { ConceptPicker } from '../concepts/ConceptPicker';
import { moduleQuery, modulesQuery } from '../learning/api';
import { Field, FormError, selectClasses } from '../learning/Field';
import { AnswerKeyEditor, convertAnswer, textareaClasses } from './AnswerKeyEditor';
import { usePracticeActions } from './api';
import { KIND_LABELS } from './format';

/**
 * Writing a question of any kind (task 9.10): the stem in Markdown with maths, its answer key, the
 * explanation shown afterwards, a hint (using it marks an answer as assisted), a rubric for kinds
 * you grade yourself, difficulty, module and lecture, tags and concepts.
 */

export interface QuestionDraft {
  moduleId?: string;
  conceptIds?: string[];
}

export function QuestionEditor({
  question,
  draft,
  onClose,
}: {
  question?: Question;
  draft?: QuestionDraft;
  onClose(): void;
}) {
  const api = useApi();
  const actions = usePracticeActions();
  const formId = useId();
  const [answer, setAnswer] = useState<QuestionAnswer>(question?.answer ?? convertAnswer('mcq'));
  const kind = answer.kind;
  const [stem, setStem] = useState(question?.stem ?? '');
  const [explanation, setExplanation] = useState(question?.explanation ?? '');
  const [rubric, setRubric] = useState(question?.rubric ?? '');
  const [hint, setHint] = useState(question?.hint ?? '');
  const [difficulty, setDifficulty] = useState(question?.difficulty ?? 3);
  const [moduleId, setModuleId] = useState(question?.module?.id ?? draft?.moduleId ?? '');
  const [lectureId, setLectureId] = useState(question?.lecture?.id ?? '');
  const [tags, setTags] = useState(question?.tags.join(' ') ?? '');
  const [conceptIds, setConceptIds] = useState<string[]>(
    question?.concepts.map((concept) => concept.id) ?? draft?.conceptIds ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const modules = useQuery(modulesQuery(api));
  const module = useQuery({ ...moduleQuery(api, moduleId), enabled: moduleId !== '' });
  const selfGraded = kind === 'explain' || kind === 'derivation' || kind === 'code';

  const changeKind = (next: QuestionKind) => setAnswer(convertAnswer(next, answer));

  const saving = actions.createQuestion.isPending || actions.updateQuestion.isPending;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const problem =
      (answer.kind === 'mcq' || answer.kind === 'multi') &&
      answer.options.some((option) => !option.text.trim())
        ? 'Every option needs some text.'
        : answer.kind === 'short' && answer.accepted.length === 0
          ? 'Give at least one accepted answer.'
          : answerProblem(answer);
    if (problem) {
      setError(problem);
      return;
    }
    const body = {
      stem,
      answer,
      explanation,
      rubric: selfGraded ? rubric : '',
      hint,
      difficulty,
      moduleId: moduleId || null,
      lectureId: lectureId || null,
      tags: tags
        .split(/[\s,]+/u)
        .map((tag) => tag.replace(/^#/u, ''))
        .filter(Boolean),
      conceptIds,
    };
    try {
      if (question) await actions.updateQuestion.mutateAsync({ id: question.id, ...body });
      else {
        await actions.createQuestion.mutateAsync(body);
        notifySuccess('Question added');
      }
      onClose();
    } catch (reason) {
      setError(describeError(reason).description);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={question ? 'Edit question' : 'New question'}
      size="lg"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={saving}>
            {question ? 'Save' : 'Add question'}
          </Button>
        </div>
      }
    >
      <form id={formId} className="space-y-4" onSubmit={submit}>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Kind" className="w-48">
            {(id) => (
              <select
                id={id}
                className={selectClasses}
                value={kind}
                onChange={(event) => changeKind(event.target.value as QuestionKind)}
              >
                {QUESTION_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {KIND_LABELS[value]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Difficulty" className="w-36">
            {(id) => (
              <select
                id={id}
                className={selectClasses}
                value={difficulty}
                onChange={(event) => setDifficulty(Number(event.target.value))}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value} {value === 1 ? '(easy)' : value === 5 ? '(hard)' : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Module" className="min-w-40 flex-1">
            {(id) => (
              <select
                id={id}
                className={selectClasses}
                value={moduleId}
                onChange={(event) => {
                  setModuleId(event.target.value);
                  setLectureId('');
                }}
              >
                <option value="">None</option>
                {(modules.data?.modules ?? []).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.code} — {option.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {moduleId && (
            <Field label="Lecture" className="min-w-40 flex-1">
              {(id) => (
                <select
                  id={id}
                  className={selectClasses}
                  value={lectureId}
                  onChange={(event) => setLectureId(event.target.value)}
                >
                  <option value="">None</option>
                  {(module.data?.lectures ?? []).map((lecture) => (
                    <option key={lecture.id} value={lecture.id}>
                      {lecture.key} {lecture.title}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
        </div>

        <Field label="Question" hint="Markdown and $maths$ work.">
          {(id, describedBy) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              required
              rows={3}
              className={textareaClasses}
              value={stem}
              onChange={(event) => setStem(event.target.value)}
            />
          )}
        </Field>

        <AnswerKeyEditor value={answer} onChange={setAnswer} />

        {selfGraded && (
          <Field label="Rubric" hint="The points a good answer makes, to grade yourself against.">
            {(id, describedBy) => (
              <textarea
                id={id}
                aria-describedby={describedBy}
                rows={3}
                className={textareaClasses}
                value={rubric}
                onChange={(event) => setRubric(event.target.value)}
              />
            )}
          </Field>
        )}
        <Field label="Explanation" hint="Shown after answering: why the answer is what it is.">
          {(id, describedBy) => (
            <textarea
              id={id}
              aria-describedby={describedBy}
              rows={2}
              className={textareaClasses}
              value={explanation}
              onChange={(event) => setExplanation(event.target.value)}
            />
          )}
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <Field
            label="Hint"
            hint="Optional. Using it counts the answer as helped."
            className="min-w-56 flex-1"
          >
            {(id, describedBy) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={hint}
                onChange={(event) => setHint(event.target.value)}
              />
            )}
          </Field>
          <Field label="Tags" hint="Separated by spaces." className="w-56">
            {(id, describedBy) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
              />
            )}
          </Field>
        </div>
        <ConceptPicker value={conceptIds} onChange={setConceptIds} />
        <FormError error={error} />
      </form>
    </Dialog>
  );
}
