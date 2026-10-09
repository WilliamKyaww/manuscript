import {
  type AnswerInput,
  answerEndpoint,
  conceptMasteryEndpoint,
  createQuestionEndpoint,
  createQuizEndpoint,
  deleteQuestionEndpoint,
  deleteQuizEndpoint,
  exportQuizEndpoint,
  finishAttemptEndpoint,
  getAttemptEndpoint,
  getLearnEndpoint,
  gradeAnswerEndpoint,
  type LearnScopeSchema,
  listQuestionsEndpoint,
  listQuizzesEndpoint,
  previewQuizEndpoint,
  progressEndpoint,
  type QuestionInput,
  type QuestionResponse,
  type QuizInput,
  retakeAttemptEndpoint,
  type SelfScore,
  saveDraftEndpoint,
  startAttemptEndpoint,
  startLearnEndpoint,
  submitAttemptEndpoint,
  updateQuestionEndpoint,
  weakAreasEndpoint,
} from '@skb/core';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { z } from 'zod';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';

/** Questions, quizzes, attempts, Learn sessions and mastery (Phase 9). */

export const practiceKeys = {
  all: ['practice'] as const,
  questions: (filter: QuestionFilter) => ['practice', 'questions', filter] as const,
  quizzes: () => ['practice', 'quizzes'] as const,
  attempt: (id: string) => ['practice', 'attempt', id] as const,
  learn: (id: string) => ['practice', 'learn', id] as const,
};

export const masteryKeys = {
  all: ['mastery'] as const,
  progress: (module?: string) => ['mastery', 'progress', module ?? 'all'] as const,
  concept: (id: string) => ['mastery', 'concept', id] as const,
  weak: (module?: string) => ['mastery', 'weak', module ?? 'all'] as const,
};

export interface QuestionFilter {
  module?: string;
  concept?: string;
  kind?: string;
  q?: string;
}

export const questionsQuery = (api: ApiClient, filter: QuestionFilter = {}) =>
  queryOptions({
    queryKey: practiceKeys.questions(filter),
    queryFn: () =>
      api.request(listQuestionsEndpoint, {
        query: Object.fromEntries(
          Object.entries(filter).filter(([, value]) => value !== undefined && value !== ''),
        ),
      }),
    staleTime: 15_000,
  });

export const quizzesQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: practiceKeys.quizzes(),
    queryFn: () => api.request(listQuizzesEndpoint),
    staleTime: 15_000,
  });

/** How many active questions a quiz configuration would draw from. */
export const quizPreviewQuery = (api: ApiClient, config: QuizInput['config']) =>
  queryOptions({
    queryKey: ['practice', 'preview', config] as const,
    queryFn: () => api.request(previewQuizEndpoint, { body: { config } }),
    staleTime: 10_000,
  });

export const attemptQuery = (api: ApiClient, id: string) =>
  queryOptions({
    queryKey: practiceKeys.attempt(id),
    queryFn: () => api.request(getAttemptEndpoint, { params: { id } }),
  });

export const learnQuery = (api: ApiClient, id: string) =>
  queryOptions({
    queryKey: practiceKeys.learn(id),
    queryFn: () => api.request(getLearnEndpoint, { params: { id } }),
  });

export const progressQuery = (api: ApiClient, module?: string) =>
  queryOptions({
    queryKey: masteryKeys.progress(module),
    queryFn: () => api.request(progressEndpoint, { query: module ? { module } : {} }),
    staleTime: 30_000,
  });

export const conceptMasteryQuery = (api: ApiClient, id: string) =>
  queryOptions({
    queryKey: masteryKeys.concept(id),
    queryFn: () => api.request(conceptMasteryEndpoint, { params: { id } }),
    staleTime: 30_000,
  });

export const weakAreasQuery = (api: ApiClient, module?: string, limit = 20) =>
  queryOptions({
    queryKey: [...masteryKeys.weak(module), limit],
    queryFn: () =>
      api.request(weakAreasEndpoint, { query: { limit, ...(module ? { module } : {}) } }),
    staleTime: 30_000,
  });

/** Writes change the bank, quizzes and mastery alike. */
function usePracticeMutation<V, R>(mutationFn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: practiceKeys.all });
      void queryClient.invalidateQueries({ queryKey: masteryKeys.all });
    },
  });
}

export function usePracticeActions() {
  const api = useApi();
  return {
    createQuestion: usePracticeMutation((body: QuestionInput) =>
      api.request(createQuestionEndpoint, { body }),
    ),
    updateQuestion: usePracticeMutation(
      ({ id, ...body }: Partial<QuestionInput> & { id: string }) =>
        api.request(updateQuestionEndpoint, { params: { id }, body }),
    ),
    deleteQuestion: usePracticeMutation((id: string) =>
      api.request(deleteQuestionEndpoint, { params: { id } }),
    ),
    createQuiz: usePracticeMutation((body: QuizInput) => api.request(createQuizEndpoint, { body })),
    deleteQuiz: usePracticeMutation((id: string) =>
      api.request(deleteQuizEndpoint, { params: { id } }),
    ),
    exportQuiz: useMutation({
      mutationFn: (id: string) => api.request(exportQuizEndpoint, { params: { id } }),
    }),
    startAttempt: usePracticeMutation((quizId: string) =>
      api.request(startAttemptEndpoint, { params: { id: quizId } }),
    ),
    startLearn: usePracticeMutation(
      ({
        scope,
        timeLimitMinutes,
      }: {
        scope: z.input<typeof LearnScopeSchema>;
        timeLimitMinutes?: number;
      }) =>
        api.request(startLearnEndpoint, {
          body: { scope, ...(timeLimitMinutes ? { timeLimitMinutes } : {}) },
        }),
    ),
    retake: usePracticeMutation((attemptId: string) =>
      api.request(retakeAttemptEndpoint, { params: { id: attemptId } }),
    ),
  };
}

/** Calls made while answering; the pages refresh their own attempt or session afterwards. */
export function useAttemptCalls() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMemo(() => attemptCalls(api, queryClient), [api, queryClient]);
}

function attemptCalls(api: ApiClient, queryClient: ReturnType<typeof useQueryClient>) {
  const touched = () => void queryClient.invalidateQueries({ queryKey: masteryKeys.all });
  return {
    answer: async (attemptId: string, body: AnswerInput) => {
      const result = await api.request(answerEndpoint, { params: { id: attemptId }, body });
      touched();
      return result;
    },
    grade: async (answerId: string, score: SelfScore) => {
      const result = await api.request(gradeAnswerEndpoint, {
        params: { id: answerId },
        body: { score },
      });
      touched();
      return result;
    },
    saveDraft: (attemptId: string, responses: Record<string, QuestionResponse>) =>
      api.request(saveDraftEndpoint, { params: { id: attemptId }, body: { responses } }),
    submit: async (attemptId: string, responses: Record<string, QuestionResponse>) => {
      const result = await api.request(submitAttemptEndpoint, {
        params: { id: attemptId },
        body: { responses },
      });
      touched();
      return result;
    },
    finish: async (attemptId: string) => {
      const result = await api.request(finishAttemptEndpoint, { params: { id: attemptId } });
      void queryClient.invalidateQueries({ queryKey: practiceKeys.quizzes() });
      return result;
    },
  };
}
