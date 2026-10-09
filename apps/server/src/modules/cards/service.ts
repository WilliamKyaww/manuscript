import {
  type Card,
  type CardInputSchema,
  type CardSet,
  type CardSetInputSchema,
  clozeNumbers,
  createScheduler,
  faceOrdinals,
  fromAnkiText,
  type Id,
  type IdFactory,
  LocatorSchema,
  NotFoundError,
  toAnkiText,
  ValidationError,
} from '@skb/core';
import type { z } from 'zod';
import type { Clock } from '../../shared/clock';
import type { LearningRepository } from '../learning/repository';
import type { SettingsService } from '../settings/service';
import { reviewDay } from './days';
import type { CardRow, CardsRepository, FaceRow, SetRow } from './repository';

/**
 * Card sets and cards (tasks 8.03, 8.06, 8.11). Saving a card keeps its faces in step: a new
 * cloze number gets a new face, a removed one is retired (its history kept, and restored if the
 * number comes back); changing a basic card to reversed adds the back-to-front face.
 */

type SetInput = z.output<typeof CardSetInputSchema>;
type CardInput = z.output<typeof CardInputSchema>;

export interface CardsDependencies {
  repo: CardsRepository;
  learning: LearningRepository;
  settings: SettingsService;
  clock: Clock;
  ids: IdFactory;
}

export function createCardsService(deps: CardsDependencies) {
  const { repo, learning, settings, clock, ids } = deps;
  const now = () => clock.now().toISOString();

  const requireSet = (id: string): SetRow => {
    const row = repo.set(id);
    if (!row) throw new NotFoundError('That card set does not exist.');
    return row;
  };
  const requireCard = (id: string): CardRow => {
    const row = repo.card(id);
    if (!row) throw new NotFoundError('That card does not exist.');
    return row;
  };

  const checkPlace = (
    moduleId: string | null | undefined,
    lectureId: string | null | undefined,
  ) => {
    if (moduleId && !learning.module(moduleId))
      throw new ValidationError('That module does not exist.');
    if (lectureId) {
      const lecture = learning.lecture(lectureId);
      if (!lecture) throw new ValidationError('That lecture does not exist.');
      if (moduleId && lecture.moduleId !== moduleId)
        throw new ValidationError('The lecture belongs to another module.');
    }
  };

  const setOf = (
    row: SetRow,
    counts = repo.setCounts(reviewDay(clock.now()).end.toISOString(), now()),
  ): CardSet => {
    const module = row.moduleId ? learning.module(row.moduleId) : null;
    const lecture = row.lectureId ? learning.lecture(row.lectureId) : null;
    return {
      id: row.id as CardSet['id'],
      title: row.title,
      description: row.description,
      module: module
        ? { id: module.id as Id<'module'>, code: module.code, title: module.title }
        : null,
      lecture: lecture
        ? { id: lecture.id as Id<'lecture'>, key: lecture.key, title: lecture.title }
        : null,
      origin: row.origin,
      counts: counts.get(row.id) ?? { cards: 0, new: 0, due: 0, suspended: 0 },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  };

  const cardsOf = (rows: readonly CardRow[]): Card[] => {
    const cardIds = rows.map((row) => row.id);
    const concepts = repo.conceptsOf(cardIds);
    const faces = new Map<string, FaceRow[]>();
    for (const face of repo.faces(cardIds))
      if (!face.retired) faces.set(face.cardId, [...(faces.get(face.cardId) ?? []), face]);
    return rows.map((row) => ({
      id: row.id as Card['id'],
      setId: row.setId as Card['setId'],
      kind: row.kind,
      front: row.front,
      back: row.back,
      extra: row.extra,
      status: row.status,
      locator: row.locatorJson ? LocatorSchema.parse(JSON.parse(row.locatorJson)) : null,
      concepts: (concepts.get(row.id) ?? []) as Card['concepts'],
      faces: (faces.get(row.id) ?? []).map((face) => ({
        ordinal: face.ordinal,
        state: face.state,
        due: face.due,
        reps: face.schedule.reps,
        lapses: face.schedule.lapses,
        buriedUntil: face.buriedUntil,
      })),
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  };

  const checkContent = (kind: CardRow['kind'], front: string) => {
    if (kind === 'cloze' && clozeNumbers(front).length === 0)
      throw new ValidationError(
        'A cloze card needs at least one deletion, such as {{c1::answer}}.',
      );
  };

  const checkConcepts = (conceptIds: readonly string[] | undefined) => {
    if (!conceptIds) return;
    const found = repo.existingConcepts(conceptIds);
    if (conceptIds.some((id) => !found.has(id)))
      throw new ValidationError('A concept does not exist.');
  };

  /** Makes the card's faces match its kind and text. */
  const syncFaces = (card: CardRow) => {
    const wanted = new Set(faceOrdinals(card.kind, card.front));
    const existing = new Map(repo.faces([card.id]).map((face) => [face.ordinal, face]));
    const scheduler = createScheduler(settings.review());
    for (const ordinal of wanted) {
      const face = existing.get(ordinal);
      if (!face) repo.insertFace(card.id, ordinal, scheduler.initial(clock.now()));
      else if (face.retired) repo.setRetired(card.id, ordinal, false);
    }
    for (const [ordinal, face] of existing)
      if (!wanted.has(ordinal) && !face.retired) repo.setRetired(card.id, ordinal, true);
  };

  const insertCard = (input: CardInput, createdBy: CardRow['createdBy']): string => {
    requireSet(input.setId);
    checkContent(input.kind, input.front);
    checkConcepts(input.conceptIds);
    const id = ids('card');
    const row: CardRow = {
      id,
      setId: input.setId,
      kind: input.kind,
      front: input.front,
      back: input.back ?? '',
      extra: input.extra ?? '',
      status: input.status ?? 'active',
      locatorJson: input.locator ? JSON.stringify(input.locator) : null,
      createdBy,
      createdAt: now(),
      updatedAt: now(),
    };
    repo.insertCard(row);
    repo.setConcepts(id, input.conceptIds ?? []);
    syncFaces(row);
    return id;
  };

  return {
    requireCard,
    cardsOf,

    listSets: (): CardSet[] => {
      const counts = repo.setCounts(reviewDay(clock.now()).end.toISOString(), now());
      return repo.sets().map((row) => setOf(row, counts));
    },
    getSet: (id: string) => {
      const row = requireSet(id);
      return { ...setOf(row), cards: cardsOf(repo.cardsOfSet(id)) };
    },
    createSet(input: SetInput, origin: SetRow['origin'] = 'manual'): CardSet {
      checkPlace(input.moduleId, input.lectureId);
      const row: SetRow = {
        id: ids('cardSet'),
        title: input.title,
        description: input.description ?? '',
        moduleId: input.moduleId ?? null,
        lectureId: input.lectureId ?? null,
        origin,
        createdAt: now(),
        updatedAt: now(),
      };
      repo.insertSet(row);
      return setOf(row);
    },
    updateSet(id: string, input: Partial<SetInput>): CardSet {
      const current = requireSet(id);
      const next: SetRow = {
        ...current,
        title: input.title ?? current.title,
        description: input.description ?? current.description,
        moduleId: input.moduleId !== undefined ? input.moduleId : current.moduleId,
        lectureId: input.lectureId !== undefined ? input.lectureId : current.lectureId,
        updatedAt: now(),
      };
      checkPlace(next.moduleId, next.lectureId);
      repo.updateSet(next);
      return setOf(next);
    },
    deleteSet(id: string): void {
      requireSet(id);
      repo.transaction(() => repo.deleteSet(id, now()));
    },

    getCard: (id: string): Card => cardsOf([requireCard(id)])[0] as Card,
    createCard(input: CardInput, createdBy: CardRow['createdBy'] = 'user'): Card {
      const id = repo.transaction(() => insertCard(input, createdBy));
      return cardsOf([requireCard(id)])[0] as Card;
    },
    updateCard(id: string, input: Partial<CardInput>): Card {
      const current = requireCard(id);
      repo.transaction(() => {
        if (input.setId && input.setId !== current.setId) requireSet(input.setId);
        checkConcepts(input.conceptIds);
        const next: CardRow = {
          ...current,
          setId: input.setId ?? current.setId,
          kind: input.kind ?? current.kind,
          front: input.front ?? current.front,
          back: input.back ?? current.back,
          extra: input.extra ?? current.extra,
          status: input.status ?? current.status,
          locatorJson:
            input.locator !== undefined
              ? input.locator
                ? JSON.stringify(input.locator)
                : null
              : current.locatorJson,
          updatedAt: now(),
        };
        checkContent(next.kind, next.front);
        repo.updateCard(next);
        if (input.conceptIds) repo.setConcepts(id, input.conceptIds);
        syncFaces(next);
      });
      return cardsOf([requireCard(id)])[0] as Card;
    },
    deleteCard(id: string): void {
      requireCard(id);
      repo.setStatus([id], 'deleted', now());
    },
    bulk(
      cardIds: readonly string[],
      action: 'activate' | 'suspend' | 'delete' | 'move',
      setId?: string,
    ): number {
      return repo.transaction(() => {
        if (action === 'move') {
          if (!setId) throw new ValidationError('Choose the set to move the cards to.');
          requireSet(setId);
          return repo.moveCards(cardIds, setId, now());
        }
        const status =
          action === 'activate' ? 'active' : action === 'suspend' ? 'suspended' : 'deleted';
        return repo.setStatus(cardIds, status, now());
      });
    },

    exportSet(id: string): { filename: string; content: string } {
      const set = requireSet(id);
      const cards = repo.cardsOfSet(id).filter((card) => card.status !== 'draft');
      const safe = set.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'cards';
      return { filename: `${safe}.txt`, content: toAnkiText(cards) };
    },
    importSet(id: string, content: string): { imported: number; skipped: number } {
      requireSet(id);
      const parsed = fromAnkiText(content);
      let skipped = parsed.skipped;
      let imported = 0;
      repo.transaction(() => {
        for (const card of parsed.cards) {
          if (card.kind === 'cloze' && clozeNumbers(card.front).length === 0) {
            skipped += 1;
            continue;
          }
          insertCard(
            { setId: id as Id<'cardSet'>, kind: card.kind, front: card.front, back: card.back },
            'import',
          );
          imported += 1;
        }
      });
      return { imported, skipped };
    },
  };
}

export type CardsService = ReturnType<typeof createCardsService>;
