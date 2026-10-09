import {
  type Card,
  createScheduler,
  faceContent,
  formatInterval,
  type IdFactory,
  NotFoundError,
  RATINGS,
  type ReviewItem,
  type ReviewQueue,
  type ReviewRating,
  type ReviewStats,
  type Schedule,
  type SessionSummary,
  ValidationError,
} from '@skb/core';
import type { Clock } from '../../shared/clock';
import type { SettingsService } from '../settings/service';
import { type ReviewDay, reviewDay, shiftDay } from './days';
import type { CardsRepository, FaceRow, LogRow } from './repository';
import type { CardsService } from './service';

/**
 * Reviewing (tasks 8.04, 8.05, 8.10): the queue, ratings, undo, burying, sessions and statistics.
 * Queue order (learning-system.md §3.2): learning faces due now; then faces due for review today,
 * least likely to be remembered first; then new faces up to the day's limit, taking sets in turn.
 * A rating and its log are written together; undoing writes a second log row and restores the
 * schedule from the first.
 */

export interface ReviewDependencies {
  repo: CardsRepository;
  cards: CardsService;
  settings: SettingsService;
  clock: Clock;
  ids: IdFactory;
}

/** When nothing else is left, learning faces due this soon are shown early (as in Anki). */
export const LEARN_AHEAD_MS = 20 * 60_000;
const DAY_MS = 86_400_000;
const FORECAST_DAYS = 30;

type Filter = { setId?: string; moduleId?: string };

/** New faces taken from each set in turn, keeping each set's own order. */
function interleaveBySet<T extends { setId: string }>(faces: readonly T[]): T[] {
  const bySet = new Map<string, T[]>();
  for (const face of faces) bySet.set(face.setId, [...(bySet.get(face.setId) ?? []), face]);
  const queues = [...bySet.values()];
  const result: T[] = [];
  for (let round = 0; result.length < faces.length; round += 1)
    for (const queue of queues) {
      const face = queue[round];
      if (face) result.push(face);
    }
  return result;
}

export function createReviewService(deps: ReviewDependencies) {
  const { repo, cards, settings, clock, ids } = deps;
  const scheduler = () => createScheduler(settings.review());

  const item = (face: FaceRow, now: Date, setTitles?: Map<string, string>): ReviewItem => {
    const [card] = cards.cardsOf([cards.requireCard(face.cardId)]) as [Card];
    const content = faceContent(card, face.ordinal);
    const preview = scheduler().preview(face.schedule, now);
    return {
      cardId: card.id,
      ordinal: face.ordinal,
      setId: card.setId,
      setTitle: setTitles?.get(card.setId) ?? repo.set(card.setId)?.title ?? '',
      kind: card.kind,
      front: content.front,
      back: content.back,
      locator: card.locator,
      concepts: card.concepts,
      state: face.state,
      due: face.due,
      intervals: RATINGS.map((rating) => ({
        rating,
        due: preview[rating].due,
        label: formatInterval(preview[rating].intervalMs),
      })),
      retrievability: scheduler().retrievability(face.schedule, now),
    };
  };

  /** Reviews already done today: new faces introduced, and the rest. */
  const doneToday = (day: ReviewDay) => {
    const logs = repo.reviewsBetween(day.start.toISOString(), day.end.toISOString());
    const introduced = logs.filter((log) => log.previous.state === 'new').length;
    return { introduced, reviewed: logs.length - introduced };
  };

  const summary = (id: string): SessionSummary => {
    const session = repo.session(id);
    if (!session) throw new NotFoundError('That review session does not exist.');
    const logs = repo.reviewsOfSession(id);
    const inReview = logs.filter((log) => log.previous.state === 'review');
    const conceptMap = repo.conceptsOf([...new Set(logs.map((log) => log.cardId))]);
    const concepts = new Map<string, { id: string; name: string }>();
    for (const list of conceptMap.values())
      for (const concept of list) concepts.set(concept.id, concept);
    return {
      id: session.id as SessionSummary['id'],
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      reviews: logs.length,
      newFaces: logs.filter((log) => log.previous.state === 'new').length,
      again: logs.filter((log) => log.rating === 1).length,
      trueRetention:
        inReview.length === 0
          ? null
          : inReview.filter((log) => (log.rating ?? 1) > 1).length / inReview.length,
      lapses: inReview.filter((log) => log.rating === 1).length,
      durationMs: logs.reduce((sum, log) => sum + (log.durationMs ?? 0), 0),
      concepts: [...concepts.values()].sort((a, b) =>
        a.name.localeCompare(b.name, 'en'),
      ) as SessionSummary['concepts'],
    };
  };

  return {
    queue(filter: Filter, limit: number): ReviewQueue {
      const now = clock.now();
      const day = reviewDay(now);
      const config = settings.review();
      const faces = repo.reviewable(filter, now.toISOString(), day.end.toISOString());
      const isLearning = (face: FaceRow) =>
        face.state === 'learning' || face.state === 'relearning';
      const learningDue = faces
        .filter((face) => isLearning(face) && Date.parse(face.due) <= now.getTime())
        .sort((a, b) => a.due.localeCompare(b.due));
      const engine = scheduler();
      const retrievability = new Map(
        faces
          .filter((face) => face.state === 'review')
          .map((face) => [face, engine.retrievability(face.schedule, now) ?? 1]),
      );
      const { introduced, reviewed } = doneToday(day);
      const reviewCap =
        config.reviewsPerDay === null
          ? Number.POSITIVE_INFINITY
          : Math.max(0, config.reviewsPerDay - reviewed);
      const due = [...retrievability.keys()]
        .sort(
          (a, b) =>
            (retrievability.get(a) ?? 1) - (retrievability.get(b) ?? 1) ||
            a.due.localeCompare(b.due),
        )
        .slice(0, reviewCap);
      const fresh = interleaveBySet(faces.filter((face) => face.state === 'new')).slice(
        0,
        Math.max(0, config.newPerDay - introduced),
      );
      let ordered = [...learningDue, ...due, ...fresh];
      if (ordered.length === 0)
        ordered = faces
          .filter(
            (face) => isLearning(face) && Date.parse(face.due) <= now.getTime() + LEARN_AHEAD_MS,
          )
          .sort((a, b) => a.due.localeCompare(b.due));
      const titles = new Map(repo.sets().map((set) => [set.id, set.title]));
      return {
        items: ordered.slice(0, limit).map((face) => item(face, now, titles)),
        counts: { new: fresh.length, learning: learningDue.length, review: due.length },
        nextDue: ordered.length === 0 ? repo.nextLearningDue(filter, now.toISOString()) : null,
      };
    },

    rate(input: {
      cardId: string;
      ordinal: number;
      rating: ReviewRating;
      durationMs: number;
      sessionId?: string;
    }) {
      const now = clock.now();
      return repo.transaction(() => {
        const card = cards.requireCard(input.cardId);
        if (card.status !== 'active')
          throw new ValidationError('Only active cards can be reviewed.');
        const face = repo.face(input.cardId, input.ordinal);
        if (!face || face.retired) throw new NotFoundError('That card has no such face.');
        if (input.sessionId && !repo.session(input.sessionId))
          throw new ValidationError('That review session does not exist.');
        const previous: Schedule = face.schedule;
        const next = scheduler().rate(previous, input.rating, now);
        repo.saveSchedule(input.cardId, input.ordinal, next);
        const logId = ids('review');
        repo.insertLog({
          id: logId,
          kind: 'review',
          cardId: input.cardId,
          ordinal: input.ordinal,
          rating: input.rating,
          undoes: null,
          previous,
          next,
          elapsedDays: previous.lastReview
            ? (now.getTime() - Date.parse(previous.lastReview)) / DAY_MS
            : null,
          reviewedAt: now.toISOString(),
          durationMs: input.durationMs,
          sessionId: input.sessionId ?? null,
        });
        return {
          logId,
          face: {
            ordinal: input.ordinal,
            state: next.state,
            due: next.due,
            reps: next.reps,
            lapses: next.lapses,
            buriedUntil: null,
          },
        };
      });
    },

    /** Takes back the latest rating (in the session, if given) and returns that face to show again. */
    undo(sessionId?: string): ReviewItem {
      const now = clock.now();
      const last: LogRow | null = repo.lastReview(sessionId ?? null);
      if (!last) throw new NotFoundError('There is no rating to undo.');
      repo.transaction(() => {
        repo.saveSchedule(last.cardId, last.ordinal, last.previous);
        repo.insertLog({
          id: ids('review'),
          kind: 'undo',
          cardId: last.cardId,
          ordinal: last.ordinal,
          rating: null,
          undoes: last.id,
          previous: last.next,
          next: last.previous,
          elapsedDays: null,
          reviewedAt: now.toISOString(),
          durationMs: null,
          sessionId: last.sessionId,
        });
      });
      const face = repo.face(last.cardId, last.ordinal) as FaceRow;
      return item(face, now);
    },

    /** Hides a face until tomorrow's review day starts. */
    bury(cardId: string, ordinal: number): void {
      cards.requireCard(cardId);
      if (!repo.face(cardId, ordinal)) throw new NotFoundError('That card has no such face.');
      repo.bury(cardId, ordinal, reviewDay(clock.now()).end.toISOString());
    },

    startSession(filter: Filter): SessionSummary {
      const id = ids('session');
      repo.insertSession({
        id,
        setId: filter.setId ?? null,
        moduleId: filter.moduleId ?? null,
        startedAt: clock.now().toISOString(),
      });
      return summary(id);
    },
    endSession(id: string): SessionSummary {
      const before = summary(id);
      if (!before.endedAt)
        repo.endSession(id, clock.now().toISOString(), { ...before, endedAt: undefined });
      return summary(id);
    },

    stats(): ReviewStats {
      const now = clock.now();
      const today = reviewDay(now);
      const forecast = Array.from({ length: FORECAST_DAYS }, (_, offset) => ({
        day: shiftDay(today, offset),
        count: 0,
      }));
      let dueToday = 0;
      for (const { state, due } of repo.liveDueDates()) {
        const time = Date.parse(due);
        const learning = state !== 'review';
        if (learning ? time <= now.getTime() : time < today.end.getTime()) dueToday += 1;
        const slot = forecast.find(({ day }) => time < day.end.getTime());
        if (slot) slot.count += 1;
      }
      const first = shiftDay(today, -(FORECAST_DAYS - 1));
      const logs = repo.reviewsBetween(first.start.toISOString(), today.end.toISOString());
      const history = Array.from({ length: FORECAST_DAYS }, (_, offset) => {
        const day = shiftDay(first, offset);
        const ofDay = logs.filter((log) => {
          const time = Date.parse(log.reviewedAt);
          return time >= day.start.getTime() && time < day.end.getTime();
        });
        return {
          date: day.key,
          reviews: ofDay.length,
          again: ofDay.filter((log) => log.rating === 1).length,
        };
      });
      const inReview = logs.filter((log) => log.previous.state === 'review');
      const totals = repo.totals();
      return {
        dueToday,
        forecast: forecast.map(({ day, count }) => ({ date: day.key, count })),
        history,
        trueRetention:
          inReview.length === 0
            ? null
            : inReview.filter((log) => (log.rating ?? 1) > 1).length / inReview.length,
        cards: totals.cards,
        faces: totals.faces,
      };
    },
  };
}

export type ReviewService = ReturnType<typeof createReviewService>;
