import type { Course, LectureDetail, ModuleSummary } from '@skb/core';
import { type FormEvent, useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { describeError } from '../../lib/notify';
import { useLearningActions } from './api';
import { Field, FormError, numberOrNull, selectClasses } from './Field';

/** Create and edit dialogues for courses, modules and lectures (tasks 6.10, 6.12). */

function useSubmit(onDone: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (event: FormEvent, action: () => Promise<unknown>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    action()
      .then(onDone)
      .catch((reason: unknown) => setError(describeError(reason).description))
      .finally(() => setBusy(false));
  };
  return { error, busy, run };
}

export function CourseDialog({
  open,
  course,
  onClose,
}: {
  open: boolean;
  course?: Course;
  onClose(): void;
}) {
  const actions = useLearningActions();
  const [title, setTitle] = useState(course?.title ?? '');
  const [target, setTarget] = useState(course?.targetAverage?.toString() ?? '85');
  const [startDate, setStartDate] = useState(course?.startDate ?? '');
  const [endDate, setEndDate] = useState(course?.endDate ?? '');
  const { error, busy, run } = useSubmit(onClose);
  const body = {
    title,
    targetAverage: numberOrNull(target),
    startDate: startDate || null,
    endDate: endDate || null,
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={course ? 'Edit course' : 'New course'}
    >
      <form
        className="space-y-4"
        onSubmit={(event) =>
          run(event, () =>
            course
              ? actions.updateCourse.mutateAsync({ id: course.id, ...body })
              : actions.createCourse.mutateAsync(body),
          )
        }
      >
        <Field label="Title" hint="For example “Year 3 — Computer Science and AI”.">
          {(id, hint) => (
            <Input
              id={id}
              aria-describedby={hint}
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </Field>
        <Field
          label="Target average (%)"
          hint="The average across the course's modules you are aiming for."
        >
          {(id, hint) => (
            <Input
              id={id}
              aria-describedby={hint}
              inputMode="decimal"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            )}
          </Field>
          <Field label="Ends">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            )}
          </Field>
        </div>
        <FormError error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {course ? 'Save' : 'Create course'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ModuleDialog({
  open,
  module,
  courses,
  onClose,
}: {
  open: boolean;
  module?: ModuleSummary;
  courses: readonly Course[];
  onClose(): void;
}) {
  const actions = useLearningActions();
  const [code, setCode] = useState(module?.code ?? '');
  const [title, setTitle] = useState(module?.title ?? '');
  const [courseId, setCourseId] = useState(module?.courseId ?? courses[0]?.id ?? '');
  const [credits, setCredits] = useState(module?.credits?.toString() ?? '');
  const [semester, setSemester] = useState(module?.semester ?? '');
  const [target, setTarget] = useState(module?.targetMark?.toString() ?? '');
  const [colour, setColour] = useState(module?.colour ?? '#2f6f4e');
  const { error, busy, run } = useSubmit(onClose);
  const body = {
    code: code.trim(),
    title,
    courseId: courseId || null,
    credits: numberOrNull(credits),
    semester: semester.trim() || null,
    targetMark: numberOrNull(target),
    colour,
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={module ? 'Edit module' : 'New module'}
    >
      <form
        className="space-y-4"
        onSubmit={(event) =>
          run(event, () =>
            module
              ? actions.updateModule.mutateAsync({ id: module.id, ...body })
              : actions.createModule.mutateAsync(body),
          )
        }
      >
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <Field label="Code">
            {(id) => (
              <Input
                id={id}
                required
                value={code}
                placeholder="COC251"
                onChange={(event) => setCode(event.target.value)}
              />
            )}
          </Field>
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
        </div>
        <p className="text-xs text-muted">
          The code is also the folder of the module’s lecture material (
          <code>Sources/{code.trim() || 'CODE'}/</code>) and the value of a note’s{' '}
          <code>module</code> property.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Credits">
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                value={credits}
                onChange={(event) => setCredits(event.target.value)}
              />
            )}
          </Field>
          <Field label="Semester">
            {(id) => (
              <Input
                id={id}
                value={semester}
                onChange={(event) => setSemester(event.target.value)}
              />
            )}
          </Field>
          <Field label="Target mark (%)">
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label="Course">
            {(id) => (
              <select
                id={id}
                className={selectClasses}
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
              >
                <option value="">No course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Colour">
            {(id) => (
              <Input
                id={id}
                type="color"
                className="p-1"
                value={colour}
                onChange={(event) => setColour(event.target.value)}
              />
            )}
          </Field>
        </div>
        <FormError error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {module ? 'Save' : 'Create module'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const LECTURE_KINDS = ['lecture', 'lab', 'tutorial', 'workshop', 'seminar'] as const;

export function LectureDialog({
  open,
  moduleId,
  lecture,
  suggestedKey,
  onClose,
}: {
  open: boolean;
  moduleId: string;
  lecture?: LectureDetail;
  suggestedKey?: string;
  onClose(): void;
}) {
  const actions = useLearningActions();
  const [key, setKey] = useState(lecture?.key ?? suggestedKey ?? '');
  const [title, setTitle] = useState(lecture?.title ?? '');
  const [kind, setKind] = useState<(typeof LECTURE_KINDS)[number]>(lecture?.kind ?? 'lecture');
  const [week, setWeek] = useState(lecture?.week?.toString() ?? '');
  const [heldOn, setHeldOn] = useState(lecture?.heldOn ?? '');
  const { error, busy, run } = useSubmit(onClose);
  const body = { key: key.trim(), title, kind, week: numberOrNull(week), heldOn: heldOn || null };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={lecture ? 'Edit lecture' : 'New lecture'}
    >
      <form
        className="space-y-4"
        onSubmit={(event) =>
          run(event, () =>
            lecture
              ? actions.updateLecture.mutateAsync({ id: lecture.id, ...body })
              : actions.createLecture.mutateAsync({ moduleId, ...body }),
          )
        }
      >
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label="Key">
            {(id) => (
              <Input
                id={id}
                required
                value={key}
                placeholder="L03"
                onChange={(event) => setKey(event.target.value)}
              />
            )}
          </Field>
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
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Kind">
            {(id) => (
              <select
                id={id}
                className={selectClasses}
                value={kind}
                onChange={(event) => setKind(event.target.value as typeof kind)}
              >
                {LECTURE_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {value[0]?.toUpperCase()}
                    {value.slice(1)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Week">
            {(id) => (
              <Input
                id={id}
                inputMode="numeric"
                value={week}
                onChange={(event) => setWeek(event.target.value)}
              />
            )}
          </Field>
          <Field label="Date">
            {(id) => (
              <Input
                id={id}
                type="date"
                value={heldOn}
                onChange={(event) => setHeldOn(event.target.value)}
              />
            )}
          </Field>
        </div>
        <FormError error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {lecture ? 'Save' : 'Add lecture'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
