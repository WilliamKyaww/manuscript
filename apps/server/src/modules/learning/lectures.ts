import {
  ConflictError,
  type IdFactory,
  type Lecture,
  type LectureDetail,
  type LectureInputSchema,
  NotFoundError,
  ValidationError,
} from '@skb/core';
import type { z } from 'zod';
import type { Clock } from '../../shared/clock';
import type { NotesService } from '../notes/service';
import type { SourcesRepository } from '../sources/repository';
import type { LearningRepository, LectureRow } from './repository';
import type { LearningService } from './service';

/**
 * Lectures (task 6.03) and their material. Sources are attached in the database; notes are attached
 * by setting their `module` and `lecture` properties, because the note file is the record and its
 * frontmatter always wins (task 6.09, ADR-0029).
 */

type LectureInput = z.infer<typeof LectureInputSchema>;

export interface LecturesDependencies {
  repo: LearningRepository;
  learning: LearningService;
  notes: NotesService;
  sources: SourcesRepository;
  clock: Clock;
  ids: IdFactory;
}

export function createLecturesService(deps: LecturesDependencies) {
  const { repo, learning, notes, sources, clock, ids } = deps;
  const now = () => clock.now().toISOString();

  const requireLecture = (id: string): LectureRow => {
    const row = repo.lecture(id);
    if (!row) throw new NotFoundError('That lecture does not exist.');
    return row;
  };

  const detail = (id: string): LectureDetail => {
    const lecture = requireLecture(id);
    const module = learning.requireModule(lecture.moduleId);
    const lectureNotes = repo.notesOfLecture(module.codeKey, lecture.keyNorm);
    return {
      ...learning.lectureOf(lecture, module),
      module: learning.refOf(module),
      sources: repo.sourcesOfLecture(id).map((source) => ({
        ...source,
        id: source.id as LectureDetail['sources'][number]['id'],
        kind: source.kind as LectureDetail['sources'][number]['kind'],
      })),
      notes: lectureNotes.map((note) => ({
        ...note,
        id: note.id as LectureDetail['notes'][number]['id'],
      })),
      concepts: repo.conceptsLinkedFrom(lectureNotes.map((note) => note.id)).map((concept) => ({
        ...concept,
        id: concept.id as LectureDetail['concepts'][number]['id'],
      })),
    };
  };

  const checkKey = (moduleId: string, key: string, exceptId?: string) => {
    const existing = repo.lectureByKey(moduleId, key.toLowerCase());
    if (existing && existing.id !== exceptId)
      throw new ConflictError(`This module already has a lecture with the key ${key}.`);
  };

  return {
    create(moduleId: string, input: LectureInput): Lecture {
      const module = learning.requireModule(moduleId);
      checkKey(moduleId, input.key);
      const id = ids('lecture');
      repo.insert(
        'lectures',
        {
          ...input,
          id,
          moduleId,
          keyNorm: input.key.toLowerCase(),
          ordinal: input.ordinal ?? repo.lectures(moduleId).length,
        },
        now(),
      );
      return learning.lectureOf(requireLecture(id), module);
    },

    get: detail,

    update(id: string, input: Partial<LectureInput>): Lecture {
      const lecture = requireLecture(id);
      const module = learning.requireModule(lecture.moduleId);
      const values: Record<string, unknown> = { ...input };
      if (input.key !== undefined && input.key.toLowerCase() !== lecture.keyNorm) {
        checkKey(lecture.moduleId, input.key, id);
        if (repo.countNotesOfLecture(module.codeKey, lecture.keyNorm) > 0) {
          throw new ConflictError(
            `Notes refer to ${module.code}/${lecture.key} in their lecture property, so its key cannot change here.`,
          );
        }
        values.keyNorm = input.key.toLowerCase();
      }
      repo.update('lectures', id, values, now());
      return learning.lectureOf(requireLecture(id), module);
    },

    delete(id: string): void {
      requireLecture(id);
      repo.remove('lectures', id);
    },

    attachSource(id: string, sourceId: string): LectureDetail {
      requireLecture(id);
      const source = sources.byId(sourceId);
      if (!source || source.deletedAt)
        throw new ValidationError('That source is not in the library.');
      repo.attachSource(id, sourceId, now());
      return detail(id);
    },

    detachSource(id: string, sourceId: string): LectureDetail {
      requireLecture(id);
      repo.detachSource(id, sourceId);
      return detail(id);
    },

    attachNote(id: string, noteId: string): LectureDetail {
      const lecture = requireLecture(id);
      const module = learning.requireModule(lecture.moduleId);
      notes.setProperties(noteId, {
        module: module.code,
        lecture: `${module.code}/${lecture.key}`,
      });
      return detail(id);
    },

    detachNote(id: string, noteId: string): LectureDetail {
      const lecture = requireLecture(id);
      const module = learning.requireModule(lecture.moduleId);
      const attached = repo
        .notesOfLecture(module.codeKey, lecture.keyNorm)
        .some((note) => note.id === noteId);
      if (attached) notes.setProperties(noteId, { lecture: undefined });
      return detail(id);
    },
  };
}

export type LecturesService = ReturnType<typeof createLecturesService>;
