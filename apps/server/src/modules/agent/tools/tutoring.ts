import {
  ConflictError,
  idSchema,
  QuestionPromptSchema,
  ResponseSchema,
  ValidationError,
} from '@skb/core';
import { z } from 'zod';
import { defineTool, type Json } from '../types';

/**
 * Tutoring tools (tasks 14.02, 14.03): a quiz from the student's own question bank, recording what
 * they answered, and flagging where their notes disagree with the lecture material. The tutor
 * never sees an answer key before the student has replied, and a correction is only ever a
 * suggestion in the Inbox.
 */

const ConceptId = idSchema('concept');
const ModuleId = idSchema('module');
const LectureId = idSchema('lecture');
const NoteId = idSchema('note');
const SourceId = idSchema('source');

export const getQuestions = defineTool({
  name: 'get_questions',
  category: 'learning',
  description:
    'Pick questions from the student’s own question bank to put to them, by concept, module, lecture or words in the question. Returns only the question and its options, never the answer, and leaves out what this conversation has asked already. Show the question to the student and wait for their reply before calling record_answer.',
  input: z.object({
    conceptId: ConceptId.optional(),
    moduleId: ModuleId.optional(),
    lectureId: LectureId.optional(),
    query: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(10).default(1),
  }),
  output: z.object({
    total: z.number().int(),
    questions: z.array(QuestionPromptSchema),
  }),
  risk: 'read',
  execute(context, input) {
    const found = context.services.tutor.questionsFor({ ...input, limit: 50 }, context.threadId);
    return { output: { total: found.length, questions: found.slice(0, input.limit) } };
  },
  describe: (_input, output) =>
    output
      ? `Found ${output.total} question${output.total === 1 ? '' : 's'} in your bank`
      : 'Looking for questions in your bank',
});

export const recordAnswer = defineTool({
  name: 'record_answer',
  category: 'learning',
  description:
    'Record the answer the STUDENT gave to a question you put to them, exactly as they gave it, as evidence for their mastery (marked as assisted, since a tutor was helping). Only call it after the student has replied. It is permanent and cannot be undone, so it always asks the student first. Returns the score, the right answer and the explanation to talk through.',
  input: z.object({
    questionId: idSchema('question'),
    response: ResponseSchema,
    confidence: z.number().int().min(1).max(3).optional(),
  }),
  output: z.object({
    answerId: z.string(),
    questionId: z.string(),
    score: z.number().nullable(),
    correct: z.boolean().nullable(),
    assisted: z.boolean(),
    feedback: z.string(),
    explanation: z.string(),
    correctAnswer: z.string(),
  }),
  risk: 'write',
  permanent: true,
  execute(context, input) {
    if (!context.threadId)
      throw new ValidationError('Answers are recorded only inside a tutored conversation.');
    return { output: context.services.tutor.recordAnswer(context.threadId, input) };
  },
  describe(input, output) {
    const answer =
      'text' in input.response
        ? input.response.text
        : 'choice' in input.response
          ? input.response.choice
          : 'choices' in input.response
            ? input.response.choices.join(', ')
            : String(input.response.value);
    const shown = answer.length > 80 ? `${answer.slice(0, 79)}…` : answer;
    return output
      ? `Recorded your answer “${shown}”${output.correct === null ? '' : output.correct ? ' — correct' : ' — not quite'}`
      : `Record your answer “${shown}” as evidence`;
  },
});

const squash = (text: string) => text.replace(/\s+/gu, ' ').trim().toLowerCase();

export const proposeNoteCorrection = defineTool({
  name: 'propose_note_correction',
  category: 'learning',
  description:
    'Flag something in the student’s own note that the lecture material contradicts. Give the exact words from the note (copy them), the corrected words, a short explanation, and a quote from the lecture source that shows it. It becomes a suggestion in the Inbox for the student to accept; the note is not changed. Use it only when the material clearly disagrees, not for style or for things the material does not cover.',
  input: z.object({
    noteId: NoteId,
    text: z.string().min(3).max(1_000),
    replacement: z.string().max(1_000),
    explanation: z.string().trim().min(5).max(1_000),
    sourceId: SourceId,
    quote: z.string().trim().min(5).max(600),
  }),
  output: z.object({ proposalId: z.string(), noteTitle: z.string() }),
  risk: 'write',
  execute(context, input) {
    const { services } = context;
    const note = services.notes.notes.get(input.noteId);
    if (!note.content.includes(input.text))
      throw new ValidationError(
        'Those words are not in the note exactly as given. Read the note again and copy the words that are wrong.',
      );
    if (input.text === input.replacement)
      throw new ValidationError('The correction is the same as the note.');
    const source = services.sources.service.get(input.sourceId);
    const wanted = squash(input.quote);
    const section = services.sources.service
      .sections(input.sourceId)
      .find((candidate) => squash(candidate.text).includes(wanted));
    if (!section)
      throw new ValidationError(
        'That quote is not in the source. Quote the lecture material exactly.',
      );
    const row = services.proposals.propose({
      payload: {
        kind: 'correction',
        noteId: note.id,
        noteTitle: note.title,
        text: input.text,
        replacement: input.replacement,
        explanation: input.explanation,
      },
      evidence: [
        {
          quote: input.quote,
          title: source.title,
          label: section.label,
          locator: section.locator,
        },
      ],
      origin: {
        label: `A correction to “${note.title}” from the tutor`,
        jobId: null,
        moduleId: null,
        lectureId: null,
        coveredIn: { type: 'note', id: note.id },
      },
      dedupeKey: `correction:${note.id}:${squash(input.text).slice(0, 200)}`,
    });
    if (!row)
      throw new ConflictError(
        'You declined this correction before; it will not be suggested again.',
      );
    return {
      output: { proposalId: row.id, noteTitle: note.title },
      undo: { proposalIds: [row.id] } as Json,
    };
  },
  describe: (input, output) =>
    output
      ? `Flagged a mistake in “${output.noteTitle}” (waiting in the Inbox)`
      : `Flagging a mistake in a note: “${input.text.slice(0, 60)}”`,
  canUndo: (context, record) =>
    context.services.proposals.pendingAmong(
      (record.undo as { proposalIds: string[] }).proposalIds,
    ) > 0
      ? null
      : 'This suggestion has been decided already.',
  undo(context, record) {
    context.services.proposals.supersede((record.undo as { proposalIds: string[] }).proposalIds);
  },
});

export const tutoringTools = [getQuestions, recordAnswer, proposeNoteCorrection];
