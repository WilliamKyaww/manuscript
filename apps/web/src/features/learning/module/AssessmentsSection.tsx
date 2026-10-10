import type { Assessment } from '@skb/core';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Badge, type BadgeTone } from '../../../components/Badge';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { IconButton } from '../../../components/IconButton';
import { Input } from '../../../components/Input';
import { StickySection } from '../../../components/Page';
import { describeError, notifyError } from '../../../lib/notify';
import { useLearningActions } from '../api';
import { Field, FormError, numberOrNull, selectClasses } from '../Field';
import { dueLabel, formatDue, formatWeight, isoDay } from '../format';

/** A module's assessments with their weights, deadlines and marks (task 6.05). */

const KINDS = ['exam', 'coursework', 'test', 'presentation', 'project'] as const;
const STATUS: Record<Assessment['status'], { label: string; tone: BadgeTone }> = {
  planned: { label: 'To do', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'info' },
  marked: { label: 'Marked', tone: 'success' },
};

export function AssessmentsSection({
  moduleId,
  assessments,
}: {
  moduleId: string;
  assessments: readonly Assessment[];
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Assessment | null>(null);
  const actions = useLearningActions();
  const total = assessments.reduce((sum, assessment) => sum + assessment.weight, 0);
  const today = isoDay(new Date());
  return (
    <StickySection
      title="Assessments"
      description={
        assessments.length === 0
          ? 'Exams, coursework and tests, with their weights.'
          : `Weights add up to ${formatWeight(total)}${total < 0.9999 ? ' — the rest is not assigned yet' : ''}.`
      }
      actions={
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" size={14} />
          Add assessment
        </Button>
      }
    >
      {assessments.length === 0 ? (
        <p className="text-sm text-muted">
          No assessments yet. Add them to see the marks you need.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Assessment</th>
              <th className="py-1.5 pr-3 font-medium">Weight</th>
              <th className="py-1.5 pr-3 font-medium">Due</th>
              <th className="py-1.5 pr-3 font-medium">Mark (%)</th>
              <th className="py-1.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {assessments.map((assessment) => (
              <tr key={assessment.id} className="border-t border-border">
                <td className="py-2 pr-3">
                  <span className="font-medium">{assessment.title}</span>{' '}
                  <span className="text-xs text-muted">{assessment.kind}</span>{' '}
                  <Badge tone={STATUS[assessment.status].tone}>
                    {STATUS[assessment.status].label}
                  </Badge>
                </td>
                <td className="py-2 pr-3 tabular-nums">{formatWeight(assessment.weight)}</td>
                <td className="py-2 pr-3">
                  {assessment.dueAt ? (
                    <>
                      {formatDue(assessment.dueAt)}
                      {assessment.status !== 'marked' && (
                        <span className="block text-xs text-muted">
                          {dueLabel(assessment.dueAt, today)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <MarkInput
                    key={`${assessment.id}:${assessment.markAchieved}`}
                    assessment={assessment}
                  />
                </td>
                <td className="whitespace-nowrap py-2 text-right">
                  <IconButton
                    label={`Edit ${assessment.title}`}
                    icon={<Pencil size={14} />}
                    size="sm"
                    onClick={() => setEditing(assessment)}
                  />
                  <IconButton
                    label={`Delete ${assessment.title}`}
                    icon={<Trash2 size={14} />}
                    size="sm"
                    onClick={() =>
                      actions.deleteAssessment.mutate(assessment.id, { onError: notifyError })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && <AssessmentDialog moduleId={moduleId} onClose={() => setAdding(false)} />}
      {editing && (
        <AssessmentDialog
          key={editing.id}
          moduleId={moduleId}
          assessment={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </StickySection>
  );
}

/** Type a mark and leave the field (or press Enter) to save it; empty clears it. */
function MarkInput({ assessment }: { assessment: Assessment }) {
  const actions = useLearningActions();
  const [value, setValue] = useState(assessment.markAchieved?.toString() ?? '');
  const save = () => {
    const mark = numberOrNull(value);
    if (mark === assessment.markAchieved) return;
    if (mark !== null && (mark < 0 || mark > 100)) {
      setValue(assessment.markAchieved?.toString() ?? '');
      return;
    }
    actions.updateAssessment.mutate(
      { id: assessment.id, markAchieved: mark },
      { onError: notifyError },
    );
  };
  return (
    <Input
      aria-label={`Mark for ${assessment.title} (%)`}
      inputMode="decimal"
      className="h-8 w-20 tabular-nums"
      value={value}
      placeholder="—"
      onChange={(event) => setValue(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}

/** Adds an assessment, or edits `assessment` when given. */
function AssessmentDialog({
  moduleId,
  assessment,
  onClose,
}: {
  moduleId: string;
  assessment?: Assessment;
  onClose(): void;
}) {
  const actions = useLearningActions();
  const [title, setTitle] = useState(assessment?.title ?? '');
  const [kind, setKind] = useState<(typeof KINDS)[number]>(assessment?.kind ?? 'exam');
  // Rounded so that a stored 0.07 shows as 7, not 7.000000000000001.
  const [weight, setWeight] = useState(
    assessment ? String(Math.round(assessment.weight * 10_000) / 100) : '',
  );
  const [dueDate, setDueDate] = useState(assessment?.dueAt?.slice(0, 10) ?? '');
  const [dueTime, setDueTime] = useState(assessment?.dueAt?.slice(11, 16) ?? '');
  const [mark, setMark] = useState(assessment?.markAchieved?.toString() ?? '');
  const [hours, setHours] = useState(assessment?.remainingHours?.toString() ?? '');
  const [minutes, setMinutes] = useState(assessment?.durationMinutes?.toString() ?? '');
  const [submitted, setSubmitted] = useState(assessment?.status === 'submitted');
  const [error, setError] = useState<string | null>(null);
  const saving = assessment ? actions.updateAssessment : actions.createAssessment;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const percent = numberOrNull(weight);
    if (percent === null || percent <= 0 || percent > 100) {
      setError('Give the weight as a percentage of the module mark, more than 0 and at most 100.');
      return;
    }
    const markAchieved = numberOrNull(mark);
    // With a mark the server records it as marked.
    const status: Assessment['status'] | undefined =
      markAchieved === null ? (submitted ? 'submitted' : 'planned') : undefined;
    const values = {
      title,
      kind,
      weight: percent / 100,
      dueAt: dueDate ? (dueTime ? `${dueDate}T${dueTime}` : dueDate) : null,
      markAchieved,
      remainingHours: numberOrNull(hours),
      durationMinutes: (() => {
        const value = numberOrNull(minutes);
        return value === null ? null : Math.round(value);
      })(),
      ...(status ? { status } : {}),
    };
    const options = {
      onSuccess: onClose,
      onError: (reason: unknown) => setError(describeError(reason).description),
    };
    if (assessment) actions.updateAssessment.mutate({ id: assessment.id, ...values }, options);
    else actions.createAssessment.mutate({ moduleId, ...values }, options);
  };
  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={assessment ? 'Edit assessment' : 'Add assessment'}
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Field label="Title">
            {(id) => (
              <Input
                id={id}
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            )}
          </Field>
          <Field label="Kind">
            {(id) => (
              <select
                id={id}
                className={selectClasses}
                value={kind}
                onChange={(event) => setKind(event.target.value as typeof kind)}
              >
                {KINDS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Field label="Weight (%)">
            {(id) => (
              <Input
                id={id}
                required
                inputMode="decimal"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
              />
            )}
          </Field>
          <Field label="Due">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            )}
          </Field>
          <Field label="Time">
            {(id) => (
              <Input
                id={id}
                type="time"
                value={dueTime}
                onChange={(event) => setDueTime(event.target.value)}
              />
            )}
          </Field>
          <Field label="Mark (%)">
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                value={mark}
                onChange={(event) => setMark(event.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Hours left"
            hint="Your estimate for work still to do. The study plan spreads it up to the deadline."
          >
            {(id, hint) => (
              <Input
                id={id}
                aria-describedby={hint}
                inputMode="decimal"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            )}
          </Field>
          <Field label="Length (minutes)" hint="For an exam: how long a mock exam should be.">
            {(id, hint) => (
              <Input
                id={id}
                aria-describedby={hint}
                inputMode="numeric"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              />
            )}
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={submitted && mark.trim() === ''}
            disabled={mark.trim() !== ''}
            onChange={(event) => setSubmitted(event.target.checked)}
          />
          Submitted, waiting for the mark
          <span className="text-xs text-muted">— it leaves the upcoming deadlines</span>
        </label>
        <FormError error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving.isPending}>
            {assessment ? 'Save' : 'Add assessment'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
