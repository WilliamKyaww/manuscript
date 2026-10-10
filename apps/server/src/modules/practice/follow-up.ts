import { CREDIT } from '@skb/core';
import type { Logger } from '../../shared/logger';
import type { ConceptsService } from '../concepts/service';
import type { ProposalsService } from '../generation/proposals';
import type { NotesService } from '../notes/service';
import { describeKey } from '../tutor/service';
import type { AnswerRow } from './attempts-repository';
import type { QuestionsService } from './questions';

/**
 * After a session (task 15.07): what a student got wrong is worth keeping where they will read it. For
 * each wrong answer on a question about a concept with a note of its own, an Inbox suggestion adds the
 * question and its right answer under "Common mistakes" in that note. Nothing changes until it is
 * accepted, a question is suggested once for a note, and a note that already holds the question is
 * left alone. It needs no AI: the question's own key and explanation are the content.
 */

export interface FollowUpDependencies {
  questions: QuestionsService;
  concepts: ConceptsService;
  notes: NotesService;
  proposals: ProposalsService;
  logger: Logger;
}

export type FollowUp = ReturnType<typeof createFollowUp>;

export const MISTAKES_HEADING = 'Common mistakes';

const oneLine = (text: string) => text.replace(/\s+/gu, ' ').trim();

export function createFollowUp(deps: FollowUpDependencies) {
  const { questions, concepts, notes, proposals, logger } = deps;

  return {
    /** Suggests additions for the wrong answers among `answers`; returns how many were suggested. */
    afterAnswers(answers: readonly AnswerRow[], origin: string): number {
      let suggested = 0;
      for (const answer of answers) {
        if (answer.score === null || answer.score >= CREDIT.failedBelow || answer.response === null)
          continue;
        try {
          const question = questions.get(answer.questionId);
          for (const ref of question.concepts) {
            const noteId = concepts.get(ref.id).noteId;
            if (!noteId) continue;
            const note = notes.get(noteId);
            const stem = oneLine(question.stem);
            if (note.content.includes(stem)) continue;
            const detail = [
              describeKey(question) ? `**${oneLine(describeKey(question)).slice(0, 300)}**` : '',
              oneLine(question.explanation).slice(0, 500),
              answer.feedback ? `(${oneLine(answer.feedback).slice(0, 300)})` : '',
            ]
              .filter(Boolean)
              .join(' — ');
            const row = proposals.propose({
              payload: {
                kind: 'addition',
                noteId: note.id,
                noteTitle: note.title,
                heading: MISTAKES_HEADING,
                text: `- ${stem} ${detail}`.trim(),
              },
              evidence: [],
              origin: {
                label: origin,
                jobId: null,
                moduleId: null,
                lectureId: null,
                coveredIn: { type: 'note', id: note.id },
              },
              dedupeKey: `addition:${note.id}:${question.id}`,
            });
            if (row?.status === 'pending') suggested += 1;
          }
        } catch (error) {
          // A question or note that has gone since is nothing to suggest about.
          logger.info('follow-up.skipped', { answerId: answer.id, reason: String(error) });
        }
      }
      return suggested;
    },
  };
}
