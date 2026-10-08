import {
  attachLectureNoteEndpoint,
  attachLectureSourceEndpoint,
  createAssessmentEndpoint,
  createCourseEndpoint,
  createLectureEndpoint,
  createModuleEndpoint,
  createTopicEndpoint,
  deleteAssessmentEndpoint,
  deleteCourseEndpoint,
  deleteLectureEndpoint,
  deleteModuleEndpoint,
  deleteTopicEndpoint,
  detachLectureNoteEndpoint,
  detachLectureSourceEndpoint,
  getLectureEndpoint,
  getModuleEndpoint,
  listCoursesEndpoint,
  listDeadlinesEndpoint,
  listModulesEndpoint,
  updateAssessmentEndpoint,
  updateCourseEndpoint,
  updateLectureEndpoint,
  updateModuleEndpoint,
  updateTopicEndpoint,
} from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { LecturesService } from './lectures';
import type { LearningService } from './service';

const ok = { ok: true as const };

export function registerLearningRoutes(
  registry: ApiRegistry,
  learning: LearningService,
  lectures: LecturesService,
): void {
  registerEndpoint(registry, listCoursesEndpoint, () => ({ courses: learning.listCourses() }));
  registerEndpoint(registry, createCourseEndpoint, ({ body }) => learning.createCourse(body));
  registerEndpoint(registry, updateCourseEndpoint, ({ params, body }) =>
    learning.updateCourse(params.id, body),
  );
  registerEndpoint(registry, deleteCourseEndpoint, ({ params }) => {
    learning.deleteCourse(params.id);
    return ok;
  });

  registerEndpoint(registry, listModulesEndpoint, () => ({ modules: learning.listModules() }));
  registerEndpoint(registry, createModuleEndpoint, ({ body }) => learning.createModule(body));
  registerEndpoint(registry, getModuleEndpoint, ({ params }) => learning.getModule(params.id));
  registerEndpoint(registry, updateModuleEndpoint, ({ params, body }) =>
    learning.updateModule(params.id, body),
  );
  registerEndpoint(registry, deleteModuleEndpoint, ({ params }) => {
    learning.deleteModule(params.id);
    return ok;
  });

  registerEndpoint(registry, createLectureEndpoint, ({ params, body }) =>
    lectures.create(params.id, body),
  );
  registerEndpoint(registry, getLectureEndpoint, ({ params }) => lectures.get(params.id));
  registerEndpoint(registry, updateLectureEndpoint, ({ params, body }) =>
    lectures.update(params.id, body),
  );
  registerEndpoint(registry, deleteLectureEndpoint, ({ params }) => {
    lectures.delete(params.id);
    return ok;
  });
  registerEndpoint(registry, attachLectureSourceEndpoint, ({ params, body }) =>
    lectures.attachSource(params.id, body.sourceId),
  );
  registerEndpoint(registry, detachLectureSourceEndpoint, ({ params }) =>
    lectures.detachSource(params.id, params.sourceId),
  );
  registerEndpoint(registry, attachLectureNoteEndpoint, ({ params, body }) =>
    lectures.attachNote(params.id, body.noteId),
  );
  registerEndpoint(registry, detachLectureNoteEndpoint, ({ params }) =>
    lectures.detachNote(params.id, params.noteId),
  );

  registerEndpoint(registry, createTopicEndpoint, ({ params, body }) =>
    learning.createTopic(params.id, body),
  );
  registerEndpoint(registry, updateTopicEndpoint, ({ params, body }) =>
    learning.updateTopic(params.id, body),
  );
  registerEndpoint(registry, deleteTopicEndpoint, ({ params }) => {
    learning.deleteTopic(params.id);
    return ok;
  });

  registerEndpoint(registry, createAssessmentEndpoint, ({ params, body }) =>
    learning.createAssessment(params.id, body),
  );
  registerEndpoint(registry, updateAssessmentEndpoint, ({ params, body }) =>
    learning.updateAssessment(params.id, body),
  );
  registerEndpoint(registry, deleteAssessmentEndpoint, ({ params }) => {
    learning.deleteAssessment(params.id);
    return ok;
  });
  registerEndpoint(registry, listDeadlinesEndpoint, ({ query }) => ({
    deadlines: learning.deadlines(query.days),
  }));
}
