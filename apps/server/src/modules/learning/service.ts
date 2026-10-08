import type {
  AssessmentInputSchema,
  CourseInputSchema,
  ModuleInputSchema,
  TopicInputSchema,
} from '@skb/core';
import {
  type Assessment,
  ConflictError,
  type Course,
  courseSummary,
  type Deadline,
  type IdFactory,
  type Lecture,
  type ModuleDetail,
  type ModuleSummary,
  moduleSummary,
  NotFoundError,
  requirementFor,
  type Topic,
  ValidationError,
  weightsFit,
} from '@skb/core';
import type { z } from 'zod';
import type { Clock } from '../../shared/clock';
import type {
  AssessmentRow,
  LearningRepository,
  LectureRow,
  ModuleRow,
  TopicRow,
} from './repository';

/**
 * Courses, modules, topics and assessments (tasks 6.02, 6.04, 6.05). Marks are computed with the
 * `@skb/core` calculator on every read, so they never drift from the assessments.
 */

type CourseInput = z.infer<typeof CourseInputSchema>;
type ModuleInput = z.infer<typeof ModuleInputSchema>;
type TopicInput = z.infer<typeof TopicInputSchema>;
type AssessmentInput = z.infer<typeof AssessmentInputSchema>;

export interface LearningDependencies {
  repo: LearningRepository;
  clock: Clock;
  ids: IdFactory;
}

const percent = (fraction: number) => Math.round(fraction * 1000) / 10;

export function createLearningService({ repo, clock, ids }: LearningDependencies) {
  const now = () => clock.now().toISOString();
  const today = () => now().slice(0, 10);

  const requireModule = (id: string): ModuleRow => {
    const row = repo.module(id);
    if (!row) throw new NotFoundError('That module does not exist.');
    return row;
  };

  const assessmentOf = (row: AssessmentRow): Assessment => ({
    ...row,
    id: row.id as Assessment['id'],
    moduleId: row.moduleId as Assessment['moduleId'],
  });

  const topicOf = (row: TopicRow): Topic => ({
    ...row,
    id: row.id as Topic['id'],
    moduleId: row.moduleId as Topic['moduleId'],
    parentId: row.parentId as Topic['parentId'],
  });

  const lectureOf = (row: LectureRow, module: ModuleRow): Lecture => ({
    id: row.id as Lecture['id'],
    moduleId: row.moduleId as Lecture['moduleId'],
    key: row.key,
    title: row.title,
    kind: row.kind,
    week: row.week,
    heldOn: row.heldOn,
    ordinal: row.ordinal,
    sourceCount: repo.countSourcesOfLecture(row.id),
    noteCount: repo.countNotesOfLecture(module.codeKey, row.keyNorm),
  });

  const refOf = (module: ModuleRow) => ({
    id: module.id as ModuleSummary['id'],
    code: module.code,
    title: module.title,
  });

  const deadlineOf = (row: AssessmentRow, module: ModuleRow): Deadline => ({
    assessmentId: row.id as Deadline['assessmentId'],
    title: row.title,
    kind: row.kind,
    dueAt: row.dueAt ?? '',
    weight: row.weight,
    module: refOf(module),
  });

  const summaryOf = (module: ModuleRow): ModuleSummary => {
    const assessments = repo.assessments(module.id);
    const marks = moduleSummary(assessments);
    const next = assessments.find(
      (row) => row.status === 'planned' && row.dueAt !== null && row.dueAt.slice(0, 10) >= today(),
    );
    return {
      ...refOf(module),
      courseId: module.courseId as ModuleSummary['courseId'],
      credits: module.credits,
      semester: module.semester,
      colour: module.colour,
      targetMark: module.targetMark,
      archived: module.archived,
      counts: {
        lectures: repo.lectures(module.id).length,
        assessments: assessments.length,
        sources: repo.countSourcesOfModule(module.codeKey),
        notes: repo.countNotesOfModule(module.codeKey),
        concepts: repo.conceptsOfModule(module.id).length,
      },
      marks,
      requirement: module.targetMark === null ? null : requirementFor(module.targetMark, marks),
      nextDeadline: next ? deadlineOf(next, module) : null,
    };
  };

  const courseOf = (id: string): Course => {
    const row = repo.course(id);
    if (!row) throw new NotFoundError('That course does not exist.');
    // Archived modules still count: archiving tidies finished modules away, and their marks
    // remain part of the year. A dropped module is taken out of its course instead.
    const modules = repo.modules().filter((module) => module.courseId === id);
    const marks = courseSummary(
      modules.map((module) => ({
        credits: module.credits ?? 0,
        assessments: repo.assessments(module.id),
      })),
    );
    return {
      ...row,
      id: row.id as Course['id'],
      moduleCount: modules.length,
      marks,
      requirement: row.targetAverage === null ? null : requirementFor(row.targetAverage, marks),
    };
  };

  const checkCourse = (courseId: string | null | undefined) => {
    if (courseId && !repo.course(courseId))
      throw new ValidationError('That course does not exist.');
  };

  const checkWeights = (moduleId: string, weight: number, exceptId?: string) => {
    const others = repo
      .assessments(moduleId)
      .filter((row) => row.id !== exceptId)
      .map((row) => row.weight);
    if (!weightsFit([...others, weight])) {
      const total = percent([...others, weight].reduce((sum, value) => sum + value, 0));
      throw new ValidationError(
        `The assessment weights of this module would add up to ${total} %; they can be at most 100 %.`,
      );
    }
  };

  /** A mark means the work is marked; clearing it reopens it. */
  const withStatus = (input: Partial<AssessmentInput>, current?: AssessmentRow) => {
    const next = { ...input };
    if (next.markAchieved !== undefined && next.markAchieved !== null && next.status === undefined)
      next.status = 'marked';
    if (next.markAchieved === null && next.status === undefined && current?.status === 'marked')
      next.status = 'planned';
    return next;
  };

  return {
    // --- Courses -------------------------------------------------------------------------

    listCourses: (): Course[] => repo.courses().map((row) => courseOf(row.id)),
    createCourse(input: CourseInput): Course {
      const id = ids('course');
      repo.insert('courses', { id, ...input, notes: input.notes ?? '' }, now());
      return courseOf(id);
    },
    updateCourse(id: string, input: Partial<CourseInput>): Course {
      courseOf(id);
      repo.update('courses', id, input, now());
      return courseOf(id);
    },
    deleteCourse(id: string): void {
      courseOf(id);
      repo.remove('courses', id);
    },

    // --- Modules -------------------------------------------------------------------------

    listModules: (): ModuleSummary[] => repo.modules().map(summaryOf),
    createModule(input: ModuleInput): ModuleSummary {
      const codeKey = input.code.toLowerCase();
      if (repo.moduleByCode(codeKey))
        throw new ConflictError(`A module with the code ${input.code} already exists.`);
      checkCourse(input.courseId);
      const id = ids('module');
      repo.insert('modules', { ...input, id, codeKey, archived: input.archived ?? false }, now());
      return summaryOf(requireModule(id));
    },
    updateModule(id: string, input: Partial<ModuleInput>): ModuleSummary {
      const module = requireModule(id);
      checkCourse(input.courseId);
      const values: Record<string, unknown> = { ...input };
      if (input.code !== undefined && input.code.toLowerCase() !== module.codeKey) {
        const codeKey = input.code.toLowerCase();
        if (repo.moduleByCode(codeKey))
          throw new ConflictError(`A module with the code ${input.code} already exists.`);
        // Files refer to modules by code; changing it would silently detach them.
        if (
          repo.countSourcesOfModule(module.codeKey) > 0 ||
          repo.countNotesOfModule(module.codeKey) > 0
        ) {
          throw new ConflictError(
            `Notes or sources refer to ${module.code}, so its code cannot change here. Rename the Sources/${module.code} folder and update the notes' module property first.`,
          );
        }
        values.codeKey = codeKey;
      } else {
        delete values.code;
      }
      repo.update('modules', id, values, now());
      return summaryOf(requireModule(id));
    },
    deleteModule(id: string): void {
      requireModule(id);
      repo.remove('modules', id);
    },
    getModule(id: string): ModuleDetail {
      const module = requireModule(id);
      return {
        ...summaryOf(module),
        lectures: repo.lectures(id).map((row) => lectureOf(row, module)),
        topics: repo.topics(id).map(topicOf),
        assessments: repo.assessments(id).map(assessmentOf),
        sources: repo.sourcesOfModule(module.codeKey).map((source) => ({
          ...source,
          id: source.id as ModuleDetail['sources'][number]['id'],
          kind: source.kind as ModuleDetail['sources'][number]['kind'],
        })),
        notes: repo.notesOfModule(module.codeKey).map((note) => ({
          ...note,
          id: note.id as ModuleDetail['notes'][number]['id'],
        })),
        concepts: repo.conceptsOfModule(id).map((concept) => ({
          ...concept,
          id: concept.id as ModuleDetail['concepts'][number]['id'],
        })),
      };
    },

    // --- Topics --------------------------------------------------------------------------

    createTopic(moduleId: string, input: TopicInput): Topic {
      requireModule(moduleId);
      if (input.parentId) {
        const parent = repo.topic(input.parentId);
        if (!parent || parent.moduleId !== moduleId)
          throw new ValidationError('The parent topic belongs to another module.');
      }
      const id = ids('topic');
      repo.insert(
        'topics',
        {
          id,
          moduleId,
          title: input.title,
          parentId: input.parentId ?? null,
          ordinal: input.ordinal ?? repo.topics(moduleId).length,
        },
        now(),
      );
      return topicOf(repo.topic(id) as TopicRow);
    },
    updateTopic(id: string, input: Partial<TopicInput>): Topic {
      const topic = repo.topic(id);
      if (!topic) throw new NotFoundError('That topic does not exist.');
      if (input.parentId) {
        // Walk up from the new parent: reaching this topic would make a loop.
        for (
          let current = repo.topic(input.parentId);
          current;
          current = current.parentId ? repo.topic(current.parentId) : null
        ) {
          if (current.id === id)
            throw new ValidationError('A topic cannot be placed inside itself.');
          if (current.moduleId !== topic.moduleId)
            throw new ValidationError('The parent topic belongs to another module.');
        }
        if (!repo.topic(input.parentId))
          throw new ValidationError('That parent topic does not exist.');
      }
      repo.update('topics', id, input, now());
      return topicOf(repo.topic(id) as TopicRow);
    },
    deleteTopic(id: string): void {
      if (!repo.topic(id)) throw new NotFoundError('That topic does not exist.');
      repo.remove('topics', id);
    },

    // --- Assessments ---------------------------------------------------------------------

    createAssessment(moduleId: string, input: AssessmentInput): Assessment {
      requireModule(moduleId);
      checkWeights(moduleId, input.weight);
      const id = ids('assessment');
      const values = withStatus(input);
      repo.insert('assessments', { status: 'planned', notes: '', ...values, id, moduleId }, now());
      return assessmentOf(repo.assessment(id) as AssessmentRow);
    },
    updateAssessment(id: string, input: Partial<AssessmentInput>): Assessment {
      const current = repo.assessment(id);
      if (!current) throw new NotFoundError('That assessment does not exist.');
      if (input.weight !== undefined) checkWeights(current.moduleId, input.weight, id);
      repo.update('assessments', id, withStatus(input, current), now());
      return assessmentOf(repo.assessment(id) as AssessmentRow);
    },
    deleteAssessment(id: string): void {
      if (!repo.assessment(id)) throw new NotFoundError('That assessment does not exist.');
      repo.remove('assessments', id);
    },

    /** Unmarked assessments due from today up to `days` ahead. */
    deadlines(days: number): Deadline[] {
      const from = today();
      const until = new Date(Date.parse(`${from}T00:00:00Z`) + days * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const modules = new Map(repo.modules().map((module) => [module.id, module]));
      return repo.dueBetween(from, until).flatMap((row) => {
        const module = modules.get(row.moduleId);
        return module ? [deadlineOf(row, module)] : [];
      });
    },

    requireModule,
    lectureOf,
    refOf,
  };
}

export type LearningService = ReturnType<typeof createLearningService>;
