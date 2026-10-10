import {
  AiError,
  estimateOutputTokens,
  type GenerationEstimate,
  type GenerationRequest,
  GenerationRequestSchema,
  type JobSummary,
  ValidationError,
} from '@skb/core';
import { type JobQueue, PermanentJobError } from '../../jobs/queue';
import type { EventBus } from '../../shared/events';
import type { Logger } from '../../shared/logger';
import type { AiService } from '../ai/service';
import type { createExtractor } from './extract';
import type { Material, MaterialService } from './material';
import type { GenerationInput, TaskContext, TaskOutcome, TaskRunners } from './tasks';

/**
 * Generation (task 11.02): an estimate before anything is spent — the material, its tokens and an
 * approximate cost — then a background job that asks the model, checks what comes back and saves
 * it as drafts or proposals, reporting progress as it goes.
 */

export const GENERATE_JOB = 'ai.generate';

/** Instructions and the JSON structure, roughly, on top of the material. */
const OVERHEAD_TOKENS = 1_200;
const MIN_OUTPUT_TOKENS = 1_000;
const MAX_OUTPUT_TOKENS = 16_000;

export interface GenerationDependencies {
  ai: AiService;
  material: MaterialService;
  jobs: JobQueue;
  runners: TaskRunners;
  extractor: ReturnType<typeof createExtractor>;
  events: EventBus;
  logger: Logger;
}

const TASK_NAMES: Record<GenerationInput['task'], string> = {
  cards: 'Generating flashcards',
  questions: 'Generating questions',
  note: 'Writing notes',
  concepts: 'Finding concepts',
};

/** Material for generation may be longer than for one question: twice the context setting. */
export const materialBudget = (contextTokens: number) => Math.max(8_000, contextTokens * 2);

/**
 * The output a generation may use: what its items need, with room to spare, whatever the longest
 * answer set for questions — so a request for twenty questions is not cut off halfway.
 */
export const outputAllowance = (task: GenerationInput['task'], count: number) =>
  Math.min(
    MAX_OUTPUT_TOKENS,
    Math.max(MIN_OUTPUT_TOKENS, Math.ceil(estimateOutputTokens(task, count) * 1.5)),
  );

export function createGenerationService(deps: GenerationDependencies) {
  const { ai, material, jobs, runners, extractor, events, logger } = deps;

  const parse = (request: GenerationRequest | GenerationInput): GenerationInput =>
    GenerationRequestSchema.parse(request);

  const gather = (request: GenerationInput): Material =>
    material.gather(request.scope, materialBudget(ai.settings().preferences.contextTokens));

  function estimate(raw: GenerationRequest | GenerationInput): GenerationEstimate {
    const request = parse(raw);
    const found = gather(request);
    const settings = ai.settings();
    const role = settings.status.roles.chat;
    const prices = settings.preferences.roles.chat;
    const materialTokens = found.passages.reduce((sum, passage) => sum + passage.tokens, 0);
    const inputTokens = materialTokens + OVERHEAD_TOKENS;
    const outputTokens = estimateOutputTokens(request.task, request.count);
    const priced = prices.inputPrice !== null || prices.outputPrice !== null;
    let problem: string | null = null;
    if (found.passages.length === 0) problem = 'There is no text in this material to work from.';
    else if (!role.ready)
      problem = role.reason ?? 'AI is not set up. Add a provider in Settings → AI.';
    else if (settings.status.month.exhausted) problem = 'This month’s AI budget is used up.';
    return {
      passages: found.passages.length,
      materialTokens,
      truncated: found.truncated,
      inputTokens,
      outputTokens,
      cost: priced
        ? (inputTokens * (prices.inputPrice ?? 0) + outputTokens * (prices.outputPrice ?? 0)) /
          1_000_000
        : null,
      model: role.label,
      problem,
    };
  }

  async function run(
    request: GenerationInput,
    job: Pick<TaskContext, 'signal' | 'progress'> & { jobId: string | null },
  ): Promise<TaskOutcome> {
    job.progress(0.05, 'Reading the material');
    const found = gather(request);
    if (found.passages.length === 0)
      throw new ValidationError('There is no text in this material to work from.');
    job.progress(
      0.15,
      `${TASK_NAMES[request.task]} from ${found.passages.length} passage${found.passages.length === 1 ? '' : 's'}`,
    );
    const context: TaskContext = {
      request,
      material: found,
      signal: job.signal,
      autoAccept: ai.settings().preferences.autoAccept,
      maxOutputTokens: outputAllowance(request.task, request.count),
      jobId: job.jobId,
      progress: job.progress,
    };
    let outcome: TaskOutcome;
    switch (request.task) {
      case 'cards':
        outcome = await runners.runCards(context);
        break;
      case 'questions':
        outcome = await runners.runQuestions(context);
        break;
      case 'note':
        outcome = await runners.runNote(context);
        break;
      default:
        outcome = await extractor.run(context);
    }
    events.publish({ type: 'data.changed', area: 'inbox' });
    logger.info('generation.done', {
      task: request.task,
      created: outcome.created,
      skipped: outcome.skipped,
    });
    return outcome;
  }

  jobs.register<GenerationInput>({
    kind: GENERATE_JOB,
    payload: GenerationRequestSchema as never,
    // A failed generation is not retried by itself: each attempt costs money.
    maxAttempts: 1,
    timeoutMs: 10 * 60_000,
    async run({ job, payload, signal, progress, result }) {
      try {
        const outcome = await run(payload, { signal, progress, jobId: job.id });
        result(outcome.summary);
      } catch (error) {
        if (signal.aborted) throw error;
        if (error instanceof AiError || error instanceof ValidationError)
          throw new PermanentJobError(error.message, { cause: error });
        throw error;
      }
    },
  });

  return {
    estimate,

    /** Starts a generation job, refusing at once what could not run. */
    start(raw: GenerationRequest | GenerationInput): JobSummary {
      const request = parse(raw);
      const checked = estimate(request);
      if (checked.problem) {
        if (checked.passages === 0) throw new ValidationError(checked.problem);
        throw new AiError(
          ai.settings().status.month.exhausted ? 'budget' : 'not_configured',
          checked.problem,
        );
      }
      const scope = request.scope;
      const subject =
        scope.kind === 'source'
          ? scope.sourceId
          : scope.kind === 'lecture'
            ? scope.lectureId
            : scope.kind === 'note'
              ? scope.noteId
              : scope.kind === 'concept'
                ? scope.conceptId
                : null;
      return jobs.enqueue(GENERATE_JOB, request, subject ? { subject } : {});
    },

    /** Runs a generation now, without the queue (tests and the agent). */
    runNow: (raw: GenerationRequest | GenerationInput, signal = new AbortController().signal) =>
      run(parse(raw), { signal, progress: () => {}, jobId: null }),
  };
}

export type GenerationService = ReturnType<typeof createGenerationService>;
