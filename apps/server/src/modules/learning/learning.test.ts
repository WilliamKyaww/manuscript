import { readFileSync, writeFileSync } from 'node:fs';
import {
  AssessmentSchema,
  CourseSchema,
  type Lecture,
  LectureDetailSchema,
  LectureSchema,
  ModuleDetailSchema,
  type ModuleSummary,
  ModuleSummarySchema,
  NoteDetailSchema,
  TopicSchema,
} from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { jsonApi } from '../../../test/api-helpers';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';

let bed: SourcesTestbed;
afterEach(() => bed?.cleanup());

async function setUp() {
  bed = createSourcesTestbed();
  await bed.start();
  return jsonApi(bed.request);
}

describe('courses, modules and assessments', () => {
  it('computes module and course marks against targets', async () => {
    const api = await setUp();
    const course = await api.post(
      '/api/courses',
      { title: 'Year 3', targetAverage: 85 },
      201,
      CourseSchema,
    );
    const coc251 = await api.post(
      '/api/modules',
      {
        code: 'COC251',
        title: 'Distributed Systems',
        credits: 20,
        targetMark: 70,
        courseId: course.id,
      },
      201,
      ModuleSummarySchema,
    );
    const coc254 = await api.post(
      '/api/modules',
      { code: 'COC254', title: 'Machine Learning', credits: 40, courseId: course.id },
      201,
      ModuleSummarySchema,
    );
    await api.post('/api/modules', { code: 'coc251', title: 'Duplicate' }, 409);

    // 40 % coursework marked 70; a 60 % exam due in ten days.
    const coursework = await api.post(
      `/api/modules/${coc251.id}/assessments`,
      { title: 'Coursework', kind: 'coursework', weight: 0.4, markAchieved: 70 },
      201,
      AssessmentSchema,
    );
    expect(coursework.status).toBe('marked');
    await api.post(`/api/modules/${coc251.id}/assessments`, {
      title: 'Exam',
      kind: 'exam',
      weight: 0.6,
      dueAt: '2026-10-14T09:30',
      durationMinutes: 120,
    });
    const tooMuch = await api.post<{ detail: string }>(
      `/api/modules/${coc251.id}/assessments`,
      { title: 'Quiz', kind: 'test', weight: 0.1 },
      400,
    );
    expect(tooMuch.detail).toContain('110 %');
    await api.post(`/api/modules/${coc254.id}/assessments`, {
      title: 'Project',
      kind: 'project',
      weight: 1,
      markAchieved: 90,
    });

    const modules = await api.get(
      '/api/modules',
      z.object({ modules: z.array(ModuleSummarySchema) }),
    );
    const summary = modules.modules.find((module) => module.code === 'COC251') as ModuleSummary;
    expect(summary.marks).toMatchObject({ secured: 28, averageSoFar: 70, best: 88 });
    expect(summary.requirement).toEqual({ kind: 'needed', average: 70 });
    expect(summary.nextDeadline).toMatchObject({ title: 'Exam', dueAt: '2026-10-14T09:30' });
    expect(summary.counts.assessments).toBe(2);

    // Course: (20·28 + 40·90) / 60 = 69.33 secured; 85 needs (85 − 69.33) · 60 / 12 = 78.33 on the exam.
    const courses = await api.get('/api/courses', z.object({ courses: z.array(CourseSchema) }));
    const year = courses.courses[0];
    expect(year?.moduleCount).toBe(2);
    expect(year?.marks.secured).toBeCloseTo(69.333, 2);
    expect(year?.requirement?.kind).toBe('needed');
    if (year?.requirement?.kind === 'needed')
      expect(year.requirement.average).toBeCloseTo(78.333, 2);

    const deadlines = await api.get(
      '/api/deadlines?days=14',
      z.object({ deadlines: z.array(z.unknown()) }),
    );
    expect(deadlines.deadlines).toHaveLength(1);
    expect(
      (await api.get('/api/deadlines?days=7', z.object({ deadlines: z.array(z.unknown()) })))
        .deadlines,
    ).toEqual([]);

    // Clearing a mark reopens the assessment.
    const reopened = await api.patch(
      `/api/assessments/${coursework.id}`,
      { markAchieved: null },
      200,
      AssessmentSchema,
    );
    expect(reopened).toMatchObject({ status: 'planned', markAchieved: null });
  });

  it('keeps topics a tree within one module', async () => {
    const api = await setUp();
    const module = await api.post(
      '/api/modules',
      { code: 'COC251', title: 'DS' },
      201,
      ModuleSummarySchema,
    );
    const other = await api.post(
      '/api/modules',
      { code: 'COC254', title: 'ML' },
      201,
      ModuleSummarySchema,
    );
    const consensus = await api.post(
      `/api/modules/${module.id}/topics`,
      { title: 'Consensus' },
      201,
      TopicSchema,
    );
    const paxos = await api.post(
      `/api/modules/${module.id}/topics`,
      { title: 'Paxos', parentId: consensus.id },
      201,
      TopicSchema,
    );
    await api.patch(`/api/topics/${consensus.id}`, { parentId: paxos.id }, 400);
    await api.post(
      `/api/modules/${other.id}/topics`,
      { title: 'Wrong', parentId: consensus.id },
      400,
    );
    const detail = await api.get(`/api/modules/${module.id}`, ModuleDetailSchema);
    expect(detail.topics.map((topic) => [topic.title, topic.parentId])).toEqual([
      ['Consensus', null],
      ['Paxos', consensus.id],
    ]);
    await api.delete(`/api/topics/${consensus.id}`);
    expect((await api.get(`/api/modules/${module.id}`, ModuleDetailSchema)).topics).toEqual([]);
  });
});

describe('lectures and their material', () => {
  it('attaches sources and notes, with note frontmatter as the record', async () => {
    const api = await setUp();
    const module = await api.post(
      '/api/modules',
      { code: 'COC251', title: 'DS' },
      201,
      ModuleSummarySchema,
    );
    const lecture = await api.post<Lecture>(
      `/api/modules/${module.id}/lectures`,
      { key: 'L03', title: 'Consensus', week: 3, heldOn: '2026-10-12' },
      201,
      LectureSchema,
    );
    await api.post(`/api/modules/${module.id}/lectures`, { key: 'l03', title: 'Again' }, 409);
    await api.post(`/api/modules/${module.id}/lectures`, { key: 'L04', title: 'Raft' }, 201);

    const { source } = await bed.imported(
      'Lecture 3.md',
      new TextEncoder().encode('# Paxos\nSynod'),
      'COC251',
    );
    const withSource = await api.post(
      `/api/lectures/${lecture.id}/sources`,
      { sourceId: source.id },
      200,
      LectureDetailSchema,
    );
    expect(withSource.sources.map((item) => item.title)).toEqual(['Lecture 3']);

    const note = await api.post(
      '/api/notes',
      { title: 'L03 notes', content: '# L03 notes\nSee [[CAP theorem]].' },
      201,
      NoteDetailSchema,
    );
    await api.post('/api/concepts', { name: 'CAP theorem' });
    const attached = await api.post(
      `/api/lectures/${lecture.id}/notes`,
      { noteId: note.id },
      200,
      LectureDetailSchema,
    );
    expect(attached.notes.map((item) => item.title)).toEqual(['L03 notes']);
    expect(attached.concepts.map((item) => item.name)).toEqual(['CAP theorem']);
    const file = bed.abs(note.path);
    expect(readFileSync(file, 'utf8')).toMatch(/module: COC251\nlecture: COC251\/L03/);

    const detail = await api.get(`/api/modules/${module.id}`, ModuleDetailSchema);
    expect(detail.sources.map((item) => item.title)).toEqual(['Lecture 3']);
    expect(detail.notes.map((item) => item.title)).toEqual(['L03 notes']);
    expect(detail.lectures.map((item) => [item.key, item.sourceCount, item.noteCount])).toEqual([
      ['L03', 1, 1],
      ['L04', 0, 0],
    ]);

    // Edited in another program: the file wins.
    writeFileSync(file, readFileSync(file, 'utf8').replace('COC251/L03', 'L04'));
    bed.changed([note.path]);
    expect((await api.get(`/api/lectures/${lecture.id}`, LectureDetailSchema)).notes).toEqual([]);
    const l04 = detail.lectures.find((item) => item.key === 'L04');
    expect(
      (await api.get(`/api/lectures/${l04?.id}`, LectureDetailSchema)).notes.map(
        (item) => item.title,
      ),
    ).toEqual(['L03 notes']);

    // Detaching removes only the lecture property.
    await api.delete(`/api/lectures/${l04?.id}/notes/${note.id}`);
    const after = readFileSync(file, 'utf8');
    expect(after).toContain('module: COC251');
    expect(after).not.toContain('lecture:');

    // Codes and keys that files refer to cannot change here.
    await api.patch(`/api/modules/${module.id}`, { code: 'COC999' }, 409);
    await api.patch(
      `/api/modules/${module.id}`,
      { title: 'Distributed Systems', credits: 20 },
      200,
    );
    await api.delete(`/api/lectures/${lecture.id}/sources/${source.id}`, 200);
    await api.delete(`/api/modules/${module.id}`);
    await api.get(`/api/lectures/${lecture.id}`, undefined, 404);
  });
});
