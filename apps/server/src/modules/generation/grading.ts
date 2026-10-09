import {
  type AiGrade,
  ConflictError,
  GeneratedGradeSchema,
  NotFoundError,
  neutraliseSentinels,
  ValidationError,
} from '@skb/core';
import type { AiService } from '../ai/service';
import { generateStructured } from '../ai/structured';
import type { AttemptsRepository } from '../practice/attempts-repository';
import type { QuestionsService } from '../practice/questions';
import { gradePrompt } from './prompts';

/**
 * AI grading (task 11.08): for an answer waiting for its grade (an explanation, derivation, code
 * or unmatched short answer), a model compares it with the model answer and rubric and suggests a
 * score with feedback. It is only a suggestion: nothing is recorded until the student accepts it
 * (then the answer is graded by "ai", with the feedback kept) or grades it themselves.
 */

export interface GradingDependencies {
  ai: AiService;
  attemptsRepo: AttemptsRepository;
  questions: QuestionsService;
}

const SCORES = [0, 0.5, 1] as const;
const nearest = (score: number) =>
  SCORES.reduce((best, option) =>
    Math.abs(option - score) < Math.abs(best - score) ? option : best,
  );

export function createGradingService(deps: GradingDependencies) {
  const { ai, attemptsRepo, questions } = deps;

  return {
    async suggest(answerId: string, signal?: AbortSignal): Promise<AiGrade> {
      const answer = attemptsRepo.answer(answerId);
      if (!answer) throw new NotFoundError('That answer does not exist.');
      if (answer.score !== null) throw new ConflictError('That answer has already been graded.');
      const response = answer.response;
      if (!response || !('text' in response) || !response.text.trim())
        throw new ValidationError('Only written answers can be graded by AI.');
      const question = questions.get(answer.questionId);
      const key = question.answer;
      const model =
        key.kind === 'short'
          ? `Any of: ${key.accepted.join('; ')}`
          : 'model' in key
            ? key.model
            : '';
      const role = ai.status().roles.fast.ready ? 'fast' : 'chat';
      const { object } = await generateStructured(ai, {
        role,
        schema: GeneratedGradeSchema,
        system: gradePrompt(),
        content: [
          `Question:\n${question.stem}`,
          `Model answer:\n${model || '(none given)'}`,
          `Rubric:\n${question.rubric.trim() || '(none given)'}`,
          `Student’s answer:\n<student_answer>\n${neutraliseSentinels(response.text.trim())}\n</student_answer>`,
        ].join('\n\n'),
        purpose: 'grade an answer',
        maxOutputTokens: 600,
        ...(signal ? { signal } : {}),
      });
      return {
        score: nearest(object.score),
        feedback: object.feedback.trim().slice(0, 2_000),
        misconceptions: object.misconceptions
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 5),
      };
    },
  };
}

export type GradingService = ReturnType<typeof createGradingService>;
