import { dayNumber, examAwareRetention } from '@skb/core';
import { reviewDay } from '../cards/days';
import type { LearningRepository } from '../learning/repository';
import type { SettingsService } from '../settings/service';

/**
 * Exam-aware retention (task 14.07, learning-system.md §9): within 14 days of a module's exam its
 * cards are scheduled for 0.93 retention instead of the student's own setting, and back to it
 * afterwards. The setting is theirs: it can be switched off in the plan settings, and a retention
 * they chose higher is never lowered.
 */

const EXAM_KINDS = new Set(['exam', 'test']);

export interface ExamRetentionDependencies {
  learning: Pick<LearningRepository, 'assessments'>;
  settings: Pick<SettingsService, 'plan'>;
}

export function createExamRetention({ learning, settings }: ExamRetentionDependencies) {
  /** Days until the module's next exam (0 on the day), or null when none is coming. */
  function daysToExam(moduleId: string, now: Date): number | null {
    const today = dayNumber(reviewDay(now).key);
    let soonest: number | null = null;
    for (const assessment of learning.assessments(moduleId)) {
      if (!EXAM_KINDS.has(assessment.kind) || assessment.status !== 'planned' || !assessment.dueAt)
        continue;
      const days = dayNumber(assessment.dueAt) - today;
      if (days >= 0 && (soonest === null || days < soonest)) soonest = days;
    }
    return soonest;
  }

  return {
    daysToExam,
    /** The retention to schedule a module's cards for. */
    retention(moduleId: string | null, desired: number, now: Date): number {
      if (!moduleId) return desired;
      return examAwareRetention(desired, daysToExam(moduleId, now), settings.plan().examRetention);
    },
  };
}
