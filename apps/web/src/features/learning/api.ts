import {
  type AssessmentInputSchema,
  attachLectureNoteEndpoint,
  attachLectureSourceEndpoint,
  type CourseInputSchema,
  createAssessmentEndpoint,
  createCourseEndpoint,
  createLectureEndpoint,
  createModuleEndpoint,
  createTopicEndpoint,
  deleteAssessmentEndpoint,
  deleteLectureEndpoint,
  deleteModuleEndpoint,
  deleteTopicEndpoint,
  detachLectureNoteEndpoint,
  detachLectureSourceEndpoint,
  getLectureEndpoint,
  getModuleEndpoint,
  type LectureInputSchema,
  listCoursesEndpoint,
  listDeadlinesEndpoint,
  listModulesEndpoint,
  type ModuleInputSchema,
  type TopicInputSchema,
  updateAssessmentEndpoint,
  updateCourseEndpoint,
  updateLectureEndpoint,
  updateModuleEndpoint,
} from '@skb/core';
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';
import { notesKeys } from '../notes/api';

/** Query keys for the course structure (one factory per feature, architecture.md §4). */
export const learningKeys = {
  all: ['learning'] as const,
  courses: () => ['learning', 'courses'] as const,
  modules: () => ['learning', 'modules'] as const,
  module: (id: string) => ['learning', 'module', id] as const,
  lecture: (id: string) => ['learning', 'lecture', id] as const,
  deadlines: (days: number) => ['learning', 'deadlines', days] as const,
};

export const coursesQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: learningKeys.courses(),
    queryFn: () => api.request(listCoursesEndpoint),
  });
export const modulesQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: learningKeys.modules(),
    queryFn: () => api.request(listModulesEndpoint),
  });
export const moduleQuery = (api: ApiClient, id: string) =>
  queryOptions({
    queryKey: learningKeys.module(id),
    queryFn: () => api.request(getModuleEndpoint, { params: { id } }),
  });
export const lectureQuery = (api: ApiClient, id: string) =>
  queryOptions({
    queryKey: learningKeys.lecture(id),
    queryFn: () => api.request(getLectureEndpoint, { params: { id } }),
  });
export const deadlinesQuery = (api: ApiClient, days: number) =>
  queryOptions({
    queryKey: learningKeys.deadlines(days),
    queryFn: () => api.request(listDeadlinesEndpoint, { query: { days } }),
  });

/** Every course-structure mutation can change marks, counts and deadlines anywhere: refetch all. */
function useLearningMutation<V, R>(mutationFn: (variables: V) => Promise<R>, alsoNotes = false) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: learningKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['concepts'] }),
        alsoNotes ? queryClient.invalidateQueries({ queryKey: notesKeys.all }) : undefined,
      ]),
  });
}

type CourseInput = z.input<typeof CourseInputSchema>;
type ModuleInput = z.input<typeof ModuleInputSchema>;
type LectureInput = z.input<typeof LectureInputSchema>;
type TopicInput = z.input<typeof TopicInputSchema>;
type AssessmentInput = z.input<typeof AssessmentInputSchema>;

export function useLearningActions() {
  const api = useApi();
  return {
    createCourse: useLearningMutation((body: CourseInput) =>
      api.request(createCourseEndpoint, { body }),
    ),
    updateCourse: useLearningMutation(({ id, ...body }: Partial<CourseInput> & { id: string }) =>
      api.request(updateCourseEndpoint, { params: { id }, body }),
    ),
    createModule: useLearningMutation((body: ModuleInput) =>
      api.request(createModuleEndpoint, { body }),
    ),
    updateModule: useLearningMutation(({ id, ...body }: Partial<ModuleInput> & { id: string }) =>
      api.request(updateModuleEndpoint, { params: { id }, body }),
    ),
    deleteModule: useLearningMutation((id: string) =>
      api.request(deleteModuleEndpoint, { params: { id } }),
    ),
    createLecture: useLearningMutation(
      ({ moduleId, ...body }: LectureInput & { moduleId: string }) =>
        api.request(createLectureEndpoint, { params: { id: moduleId }, body }),
    ),
    updateLecture: useLearningMutation(({ id, ...body }: Partial<LectureInput> & { id: string }) =>
      api.request(updateLectureEndpoint, { params: { id }, body }),
    ),
    deleteLecture: useLearningMutation((id: string) =>
      api.request(deleteLectureEndpoint, { params: { id } }),
    ),
    createTopic: useLearningMutation(({ moduleId, ...body }: TopicInput & { moduleId: string }) =>
      api.request(createTopicEndpoint, { params: { id: moduleId }, body }),
    ),
    deleteTopic: useLearningMutation((id: string) =>
      api.request(deleteTopicEndpoint, { params: { id } }),
    ),
    createAssessment: useLearningMutation(
      ({ moduleId, ...body }: AssessmentInput & { moduleId: string }) =>
        api.request(createAssessmentEndpoint, { params: { id: moduleId }, body }),
    ),
    updateAssessment: useLearningMutation(
      ({ id, ...body }: Partial<AssessmentInput> & { id: string }) =>
        api.request(updateAssessmentEndpoint, { params: { id }, body }),
    ),
    deleteAssessment: useLearningMutation((id: string) =>
      api.request(deleteAssessmentEndpoint, { params: { id } }),
    ),
    attachSource: useLearningMutation(({ id, sourceId }: { id: string; sourceId: string }) =>
      api.request(attachLectureSourceEndpoint, { params: { id }, body: { sourceId } }),
    ),
    detachSource: useLearningMutation(({ id, sourceId }: { id: string; sourceId: string }) =>
      api.request(detachLectureSourceEndpoint, { params: { id, sourceId } }),
    ),
    attachNote: useLearningMutation(
      ({ id, noteId }: { id: string; noteId: string }) =>
        api.request(attachLectureNoteEndpoint, { params: { id }, body: { noteId } }),
      true,
    ),
    detachNote: useLearningMutation(
      ({ id, noteId }: { id: string; noteId: string }) =>
        api.request(detachLectureNoteEndpoint, { params: { id, noteId } }),
      true,
    ),
  };
}
