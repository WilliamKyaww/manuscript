import {
  addDays,
  type ConceptProgress,
  dayNumber,
  type NoteRef,
  type ResurfaceItem,
} from '@skb/core';
import type { Clock } from '../../shared/clock';
import { reviewDay } from '../cards/days';
import type { ConceptsService } from '../concepts/service';
import type { LecturesService } from '../learning/lectures';
import type { LearningService } from '../learning/service';
import type { MasteryService } from '../mastery/service';

/**
 * Resurfacing (task 15.08): ahead of a lecture (within two days), an exam or a deadline (within the
 * look-ahead), the concepts of that module the student knows least, with the reason each is there,
 * and the notes to reread. Chosen from the mastery figures and the course structure only — no model.
 */

export interface ResurfaceDependencies {
  learning: LearningService;
  lectures: LecturesService;
  mastery: MasteryService;
  concepts: ConceptsService;
  clock: Clock;
}

export type ResurfaceService = ReturnType<typeof createResurfaceService>;

const LECTURE_DAYS = 2;
const CONCEPTS_SHOWN = 3;
const NOTES_SHOWN = 3;
/** A concept this well known is not worth bringing up. */
const KNOWN_WELL = 0.8;

function whyWeak(row: ConceptProgress): string {
  const signal = row.signals.find((entry) => entry.kind !== 'no_material');
  if (signal) return signal.reason;
  if (row.components.mastery === null) return 'Not practised yet.';
  return `Mastery ${row.components.mastery.toFixed(2)}.`;
}

export function createResurfaceService(deps: ResurfaceDependencies) {
  const { learning, lectures, mastery, concepts, clock } = deps;

  return {
    upcoming(days: number): ResurfaceItem[] {
      const today = reviewDay(clock.now()).key;
      const last = addDays(today, days);
      const items: ResurfaceItem[] = [];
      const progress = mastery.overview();
      for (const module of learning.listModules()) {
        if (module.archived) continue;
        const detail = learning.getModule(module.id);
        const rows =
          progress.modules.find((entry) => entry.module.id === module.id)?.concepts ?? [];
        const ref = { id: module.id, code: module.code, title: module.title };

        const pick = (preferred: ReadonlySet<string>) =>
          rows
            .filter(
              (row) =>
                row.components.itemsLinked > 0 &&
                (row.components.mastery === null ||
                  row.components.mastery < KNOWN_WELL ||
                  row.signals.some((signal) => signal.kind !== 'no_material')),
            )
            .sort(
              (a, b) =>
                Number(preferred.has(b.concept.id)) - Number(preferred.has(a.concept.id)) ||
                b.priority - a.priority ||
                a.concept.name.localeCompare(b.concept.name),
            )
            .slice(0, CONCEPTS_SHOWN);

        const notesOf = (chosen: readonly ConceptProgress[]): NoteRef[] => {
          const notes = new Map<string, NoteRef>();
          for (const row of chosen) {
            const concept = concepts.get(row.concept.id);
            if (concept.note) notes.set(concept.note.id, concept.note);
            for (const mention of concept.mentions) notes.set(mention.note.id, mention.note);
          }
          return [...notes.values()].slice(0, NOTES_SHOWN);
        };

        const add = (
          kind: ResurfaceItem['kind'],
          title: string,
          date: string,
          lectureId: string | null,
          preferred: ReadonlySet<string>,
        ) => {
          const chosen = pick(preferred);
          if (chosen.length === 0) return;
          items.push({
            kind,
            title,
            date,
            daysUntil: dayNumber(date) - dayNumber(today),
            module: ref as ResurfaceItem['module'],
            lectureId,
            concepts: chosen.map((row) => ({
              concept: { id: row.concept.id, name: row.concept.name },
              mastery: row.components.mastery,
              stage: row.components.stage,
              reason: whyWeak(row),
            })),
            notes: notesOf(chosen),
          });
        };

        for (const lecture of detail.lectures) {
          if (!lecture.heldOn) continue;
          const date = lecture.heldOn.slice(0, 10);
          const until = dayNumber(date) - dayNumber(today);
          if (until < 0 || until > LECTURE_DAYS) continue;
          // What this lecture's notes already link to comes first, then the module's weakest.
          const linked = new Set<string>(
            lectures.get(lecture.id).concepts.map((concept) => concept.id),
          );
          add(
            'lecture',
            `${module.code} ${lecture.key} — ${lecture.title}`,
            date,
            lecture.id,
            linked,
          );
        }
        for (const assessment of detail.assessments) {
          if (assessment.status !== 'planned' || !assessment.dueAt) continue;
          const date = assessment.dueAt.slice(0, 10);
          if (date < today || date > last) continue;
          const exam = assessment.kind === 'exam' || assessment.kind === 'test';
          add(
            exam ? 'exam' : 'deadline',
            `${module.code} ${assessment.title}`,
            date,
            null,
            new Set(),
          );
        }
      }
      return items.sort((a, b) => a.daysUntil - b.daysUntil || a.title.localeCompare(b.title));
    },
  };
}
