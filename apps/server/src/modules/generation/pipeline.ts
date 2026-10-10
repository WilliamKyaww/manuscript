import {
  AiError,
  type GenerationRequest,
  type IdFactory,
  NotFoundError,
  PIPELINE_STEP_LABELS,
  PIPELINE_STEPS,
  type PipelineRun,
  type PipelineStep,
  type PipelineStepResult,
  ValidationError,
} from '@skb/core';
import { z } from 'zod';
import { type JobQueue, PermanentJobError } from '../../jobs/queue';
import type { Clock } from '../../shared/clock';
import type { EventBus } from '../../shared/events';
import type { Logger } from '../../shared/logger';
import type { LecturesService } from '../learning/lectures';
import type { LearningService } from '../learning/service';
import type { QuizzesService } from '../practice/quizzes';
import type { SettingsService } from '../settings/service';
import type { PipelineRepository, RunRow } from './pipeline-repository';
import type { GenerationService } from './service';

/**
 * The lecture pipeline (tasks 15.01–15.02): one request that takes a lecture's material through the
 * steps that make it studyable — a summary note, concepts and links, flashcards, questions and a
 * quiz of those questions — as a background job with a result for each step. Everything lands in the
 * Inbox as drafts and suggestions (or in the knowledge base where auto-accept is on for that kind).
 * A step that fails or finds nothing is reported and the others go on, except when AI itself is
 * unavailable, which stops the run.
 */

export const PIPELINE_JOB = 'ai.pipeline';

export interface PipelineDependencies {
  repo: PipelineRepository;
  generation: GenerationService;
  quizzes: QuizzesService;
  lectures: LecturesService;
  learning: LearningService;
  jobs: JobQueue;
  settings: SettingsService;
  events: EventBus;
  clock: Clock;
  ids: IdFactory;
  logger: Logger;
}

export type PipelineService = ReturnType<typeof createPipelineService>;

const COUNTS = { concepts: 10, cards: 10, questions: 8 } as const;

const TASK_OF: Record<Exclude<PipelineStep, 'quiz'>, GenerationRequest['task']> = {
  note: 'note',
  concepts: 'concepts',
  cards: 'cards',
  questions: 'questions',
};

export function createPipelineService(deps: PipelineDependencies) {
  const {
    repo,
    generation,
    quizzes,
    lectures,
    learning,
    jobs,
    settings,
    events,
    clock,
    ids,
    logger,
  } = deps;
  const now = () => clock.now().toISOString();

  const view = (row: RunRow): PipelineRun => {
    const job = row.jobId ? jobs.get(row.jobId) : null;
    const finished = row.steps.filter(
      (step) => step.status !== 'pending' && step.status !== 'running',
    );
    return {
      id: row.id as PipelineRun['id'],
      lectureId: row.lectureId as PipelineRun['lectureId'],
      status: row.status,
      trigger: row.trigger,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      steps: row.steps,
      progress:
        row.status === 'done' ? 1 : (job?.progress ?? finished.length / PIPELINE_STEPS.length),
      message: row.message ?? job?.message ?? null,
      job,
    };
  };

  function chosenSteps(wanted: readonly PipelineStep[] | undefined): PipelineStep[] {
    const config = settings.pipeline();
    return PIPELINE_STEPS.filter((step) => (wanted ? wanted.includes(step) : config[step]));
  }

  const initial = (enabled: readonly PipelineStep[]): PipelineStepResult[] =>
    PIPELINE_STEPS.map((step) =>
      enabled.includes(step)
        ? { step, status: 'pending', summary: '' }
        : { step, status: 'skipped', summary: 'Switched off.' },
    );

  function start(
    lectureId: string,
    wanted: readonly PipelineStep[] | undefined,
    trigger: 'manual' | 'auto',
  ): PipelineRun {
    const lecture = lectures.get(lectureId);
    const ready = lecture.sources.filter((source) => source.status === 'ready');
    if (ready.length === 0)
      throw new ValidationError(
        lecture.sources.length === 0
          ? 'Attach the lecture’s slides or notes first: there is nothing to work from.'
          : 'The material for this lecture is still being read. Try again in a moment.',
      );
    const steps = chosenSteps(wanted);
    if (steps.length === 0) throw new ValidationError('Every step is switched off.');
    // Refuse at once what could not run (no model, budget spent), as a single generation does.
    const estimate = generation.estimate({ task: 'cards', scope: { kind: 'lecture', lectureId } });
    if (estimate.problem) {
      if (estimate.passages === 0) throw new ValidationError(estimate.problem);
      throw new AiError('not_configured', estimate.problem);
    }
    const row: RunRow = {
      id: ids('pipelineRun'),
      lectureId,
      trigger,
      steps: initial(steps),
      sourceIds: ready.map((source) => source.id),
      jobId: null,
      status: 'queued',
      message: null,
      startedAt: now(),
      finishedAt: null,
    };
    repo.insert(row);
    const job = jobs.enqueue(PIPELINE_JOB, { runId: row.id }, { subject: lectureId });
    repo.update(row.id, { jobId: job.id });
    return view(repo.run(row.id) as RunRow);
  }

  /** Runs the steps of a run in order. */
  async function execute(
    runId: string,
    signal: AbortSignal,
    progress: (fraction: number, message?: string | null) => void,
  ): Promise<string> {
    const run = repo.run(runId);
    if (!run) throw new PermanentJobError('That pipeline run no longer exists.');
    const lecture = lectures.get(run.lectureId);
    const steps = [...run.steps];
    const save = (status: RunRow['status'] = 'running', message: string | null = null) => {
      repo.update(runId, { steps, status, message });
      events.publish({ type: 'data.changed', area: 'inbox' });
    };
    const set = (step: PipelineStep, result: Partial<PipelineStepResult>) => {
      const at = steps.findIndex((entry) => entry.step === step);
      if (at >= 0) steps[at] = { ...(steps[at] as PipelineStepResult), ...result };
    };
    const todo = steps.filter((entry) => entry.status === 'pending').map((entry) => entry.step);
    save('running');
    let questionIds: string[] = [];
    let stopped: string | null = null;

    for (const [index, step] of todo.entries()) {
      if (signal.aborted) break;
      progress(
        index / todo.length,
        `${PIPELINE_STEP_LABELS[step]} (${index + 1} of ${todo.length})`,
      );
      set(step, { status: 'running' });
      save();
      try {
        if (step === 'quiz') {
          if (questionIds.length === 0) {
            set(step, {
              status: 'skipped',
              summary: 'No questions were made, so there is nothing to put in a quiz.',
            });
          } else {
            const made = quizzes.create(
              {
                kind: 'practice',
                title: `${lecture.module.code} ${lecture.key} — ${lecture.title}`,
                config: {
                  scope: { moduleId: lecture.moduleId },
                  count: Math.min(200, questionIds.length),
                },
              },
              questionIds,
            );
            set(step, {
              status: 'done',
              summary: `A quiz of ${made.questionCount} question${made.questionCount === 1 ? '' : 's'} (taking it before you accept them works; rejected questions drop out of new attempts).`,
            });
          }
        } else {
          const count = step === 'note' ? 1 : COUNTS[step];
          const outcome = await generation.runNow(
            { task: TASK_OF[step], scope: { kind: 'lecture', lectureId: run.lectureId }, count },
            signal,
          );
          if (step === 'questions') questionIds = outcome.ids ?? [];
          set(step, {
            status: outcome.created > 0 ? 'done' : 'skipped',
            summary: outcome.summary,
          });
        }
      } catch (error) {
        if (signal.aborted) throw error;
        // Without a model nothing else can run either.
        if (error instanceof AiError) {
          set(step, { status: 'failed', summary: error.message });
          stopped = error.message;
          for (const entry of steps)
            if (entry.status === 'pending')
              set(entry.step, { status: 'skipped', summary: 'Not run: AI became unavailable.' });
          save('failed', error.message);
          break;
        }
        logger.warn('pipeline.step.failed', { step, error });
        set(step, {
          status: 'failed',
          summary: error instanceof Error ? error.message : 'It did not work.',
        });
        save();
      }
    }

    const finished = now();
    const made = steps.filter((entry) => entry.status === 'done').length;
    const failed = steps.filter((entry) => entry.status === 'failed').length;
    const summary = stopped
      ? `Stopped: ${stopped}`
      : `${made} of ${steps.filter((entry) => entry.status !== 'skipped' || entry.summary !== 'Switched off.').length} steps made something${failed ? `, ${failed} failed` : ''}. It is waiting in the Inbox.`;
    repo.update(runId, {
      steps,
      status: stopped ? 'failed' : signal.aborted ? 'cancelled' : 'done',
      message: summary,
      finishedAt: finished,
    });
    events.publish({ type: 'data.changed', area: 'inbox' });
    return summary;
  }

  jobs.register<{ runId: string }>({
    kind: PIPELINE_JOB,
    payload: z.object({ runId: z.string() }),
    // Each step spends money and each is checked by itself: a run is not retried as a whole.
    maxAttempts: 1,
    timeoutMs: 30 * 60_000,
    async run({ payload, signal, progress, result }) {
      const summary = await execute(payload.runId, signal, progress);
      result(summary);
    },
  });

  /**
   * Starts a run by itself when material arrives for a lecture (if the student has switched that on and
   * the material has not been through the pipeline already). Never throws: this runs in the background.
   */
  function maybeAutoRun(lectureId: string): PipelineRun | null {
    if (!settings.pipeline().autoRun) return null;
    try {
      const lecture = lectures.get(lectureId);
      const ready = lecture.sources.filter((source) => source.status === 'ready');
      const covered = repo.coveredSources(lectureId);
      if (ready.length === 0 || ready.every((source) => covered.has(source.id))) return null;
      const active = jobs.activeFor([lectureId]).get(lectureId);
      if (active?.kind === PIPELINE_JOB) return null;
      return start(lectureId, undefined, 'auto');
    } catch (error) {
      logger.info('pipeline.auto.skipped', { lectureId, reason: String(error) });
      return null;
    }
  }

  /** Every lecture with material that the pipeline has not been through yet. */
  function scan(): void {
    if (!settings.pipeline().autoRun) return;
    for (const module of learning.listModules())
      if (!module.archived)
        for (const lecture of learning.getModule(module.id).lectures)
          if (lecture.sourceCount > 0) maybeAutoRun(lecture.id);
  }

  // New material arrives by import or by being attached to a lecture.
  events.subscribe((event) => {
    if (
      event.type === 'sources.changed' ||
      (event.type === 'data.changed' && event.area === 'course')
    )
      scan();
  });

  return {
    start,
    scan,
    maybeAutoRun,

    /** The latest run for a lecture, if there has been one. */
    latest(lectureId: string): PipelineRun | null {
      lectures.get(lectureId);
      const row = repo.latest(lectureId);
      return row ? view(row) : null;
    },

    run(id: string): PipelineRun {
      const row = repo.run(id);
      if (!row) throw new NotFoundError('That pipeline run does not exist.');
      return view(row);
    },
  };
}
