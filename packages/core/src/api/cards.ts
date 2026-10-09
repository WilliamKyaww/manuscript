import { z } from 'zod';
import { idSchema } from '../ids';
import { CARD_KINDS } from '../learning/cards';
import { RATINGS, REVIEW_STATES, ReviewSettingsSchema } from '../learning/fsrs';
import { LocatorSchema } from '../sources/types';
import { defineEndpoint } from './contract';
import { LectureIdSchema, ModuleIdSchema, ModuleRefSchema } from './course';

/**
 * Flashcards and reviews (learning-system.md §3, Phase 8). A card is what the student writes; its
 * faces are what is reviewed (one per direction or cloze number), each with its own FSRS schedule.
 */

export const CardSetIdSchema = idSchema('cardSet');
export const CardIdSchema = idSchema('card');
export const ReviewSessionIdSchema = idSchema('session');
export const CardKindSchema = z.enum(CARD_KINDS);
export const CardStatusSchema = z.enum(['draft', 'active', 'suspended', 'deleted']);
export type CardStatus = z.infer<typeof CardStatusSchema>;
export const ReviewStateSchema = z.enum(REVIEW_STATES);
export const RatingSchema = z.union(RATINGS.map((rating) => z.literal(rating)));

export const CardCountsSchema = z.object({
  cards: z.number().int().nonnegative(),
  /** Faces never reviewed. */
  new: z.number().int().nonnegative(),
  /** Faces due today (including learning faces due now). */
  due: z.number().int().nonnegative(),
  suspended: z.number().int().nonnegative(),
});

export const CardSetSchema = z.object({
  id: CardSetIdSchema,
  title: z.string(),
  description: z.string(),
  module: ModuleRefSchema.nullable(),
  lecture: z.object({ id: LectureIdSchema, key: z.string(), title: z.string() }).nullable(),
  origin: z.enum(['manual', 'ai', 'import']),
  counts: CardCountsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CardSet = z.infer<typeof CardSetSchema>;

export const CardSetInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2_000).optional(),
  moduleId: ModuleIdSchema.nullish(),
  lectureId: LectureIdSchema.nullish(),
});

export const FaceSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  state: ReviewStateSchema,
  due: z.string(),
  reps: z.number().int(),
  lapses: z.number().int(),
  /** Buried faces wait until this time. */
  buriedUntil: z.string().nullable(),
});

const ConceptRef = z.object({ id: idSchema('concept'), name: z.string() });

export const CardSchema = z.object({
  id: CardIdSchema,
  setId: CardSetIdSchema,
  kind: CardKindSchema,
  front: z.string(),
  back: z.string(),
  /** Shown after the answer: context, a mnemonic, where it came from. */
  extra: z.string(),
  status: CardStatusSchema,
  /** Where the card came from in a source, for "Show source". */
  locator: LocatorSchema.nullable(),
  concepts: z.array(ConceptRef),
  faces: z.array(FaceSchema),
  createdBy: z.enum(['user', 'ai', 'import']),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Card = z.infer<typeof CardSchema>;

const TEXT = 20_000;

export const CardInputSchema = z.object({
  setId: CardSetIdSchema,
  kind: CardKindSchema,
  front: z.string().trim().min(1).max(TEXT),
  back: z.string().max(TEXT).optional(),
  extra: z.string().max(TEXT).optional(),
  status: z.enum(['draft', 'active', 'suspended']).optional(),
  locator: LocatorSchema.nullish(),
  conceptIds: z.array(idSchema('concept')).max(50).optional(),
});
export type CardInput = z.input<typeof CardInputSchema>;

export const CardSetDetailSchema = CardSetSchema.extend({ cards: z.array(CardSchema) });

// --- Reviewing ----------------------------------------------------------------------------------

export const ReviewItemSchema = z.object({
  cardId: CardIdSchema,
  ordinal: z.number().int().nonnegative(),
  setId: CardSetIdSchema,
  setTitle: z.string(),
  kind: CardKindSchema,
  /** The face as it is shown before and after the answer (Markdown). */
  front: z.string(),
  back: z.string(),
  locator: LocatorSchema.nullable(),
  concepts: z.array(ConceptRef),
  state: ReviewStateSchema,
  due: z.string(),
  /** What each rating would do: the next due time and how it reads ("10 min", "4 d"). */
  intervals: z.array(z.object({ rating: RatingSchema, due: z.string(), label: z.string() })),
  retrievability: z.number().nullable(),
});
export type ReviewItem = z.infer<typeof ReviewItemSchema>;

export const ReviewQueueSchema = z.object({
  items: z.array(ReviewItemSchema),
  /** What is left to do now, by kind of face. */
  counts: z.object({
    new: z.number().int(),
    learning: z.number().int(),
    review: z.number().int(),
  }),
  /** When nothing is due, the next learning face (so a session can wait for it). */
  nextDue: z.string().nullable(),
});
export type ReviewQueue = z.infer<typeof ReviewQueueSchema>;

export const ReviewInputSchema = z.object({
  cardId: CardIdSchema,
  ordinal: z.number().int().nonnegative(),
  rating: RatingSchema,
  /** Time spent on the face, for statistics. */
  durationMs: z.number().int().min(0).max(86_400_000),
  sessionId: ReviewSessionIdSchema.optional(),
});

export const SessionSummarySchema = z.object({
  id: ReviewSessionIdSchema,
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  reviews: z.number().int(),
  /** Faces seen for the first time. */
  newFaces: z.number().int(),
  again: z.number().int(),
  /** Faces in review rated anything but Again, over all faces in review (null when none). */
  trueRetention: z.number().nullable(),
  lapses: z.number().int(),
  durationMs: z.number().int(),
  concepts: z.array(ConceptRef),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const ReviewStatsSchema = z.object({
  dueToday: z.number().int(),
  /** Faces falling due on each of the next days (local dates). */
  forecast: z.array(z.object({ date: z.string(), count: z.number().int() })),
  /** Reviews on each of the past days. */
  history: z.array(
    z.object({ date: z.string(), reviews: z.number().int(), again: z.number().int() }),
  ),
  /** Over the past days, faces in review recalled (null without any). */
  trueRetention: z.number().nullable(),
  cards: z.number().int(),
  faces: z.number().int(),
});
export type ReviewStats = z.infer<typeof ReviewStatsSchema>;

// --- Endpoints ----------------------------------------------------------------------------------

const SetParams = z.object({ id: CardSetIdSchema });
const CardParams = z.object({ id: CardIdSchema });
const SessionParams = z.object({ id: ReviewSessionIdSchema });
const ok = z.object({ ok: z.literal(true) });

export const listCardSetsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/card-sets',
  response: z.object({ sets: z.array(CardSetSchema) }),
});
export const createCardSetEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/card-sets',
  status: 201,
  body: CardSetInputSchema,
  response: CardSetSchema,
});
export const getCardSetEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/card-sets/:id',
  params: SetParams,
  response: CardSetDetailSchema,
});
export const updateCardSetEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/card-sets/:id',
  params: SetParams,
  body: CardSetInputSchema.partial(),
  response: CardSetSchema,
});
export const deleteCardSetEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/card-sets/:id',
  params: SetParams,
  response: ok,
});
export const exportCardSetEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/card-sets/:id/export',
  params: SetParams,
  response: z.object({ filename: z.string(), content: z.string() }),
});
export const importCardSetEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/card-sets/:id/import',
  params: SetParams,
  body: z.object({ content: z.string().max(5_000_000) }),
  response: z.object({ imported: z.number().int(), skipped: z.number().int() }),
});

export const createCardEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/cards',
  status: 201,
  body: CardInputSchema,
  response: CardSchema,
});
export const getCardEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/cards/:id',
  params: CardParams,
  response: CardSchema,
});
export const updateCardEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/cards/:id',
  params: CardParams,
  body: CardInputSchema.partial(),
  response: CardSchema,
});
export const deleteCardEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/cards/:id',
  params: CardParams,
  response: ok,
});
export const bulkCardsEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/cards/bulk',
  body: z.object({
    ids: z.array(CardIdSchema).min(1).max(5_000),
    action: z.enum(['activate', 'suspend', 'delete', 'move']),
    setId: CardSetIdSchema.optional(),
  }),
  response: z.object({ changed: z.number().int() }),
});
export const buryFaceEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/cards/:id/bury',
  params: CardParams,
  body: z.object({ ordinal: z.number().int().nonnegative() }),
  response: ok,
});

export const reviewQueueEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/review/queue',
  query: z.object({
    set: CardSetIdSchema.optional(),
    module: ModuleIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  }),
  response: ReviewQueueSchema,
});
export const reviewEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/reviews',
  status: 201,
  body: ReviewInputSchema,
  response: z.object({ logId: z.string(), face: FaceSchema }),
});
export const undoReviewEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/reviews/undo',
  body: z.object({ sessionId: ReviewSessionIdSchema.optional() }),
  response: z.object({ item: ReviewItemSchema }),
});
export const startSessionEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/review-sessions',
  status: 201,
  body: z.object({ setId: CardSetIdSchema.optional(), moduleId: ModuleIdSchema.optional() }),
  response: SessionSummarySchema,
});
export const endSessionEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/review-sessions/:id/end',
  params: SessionParams,
  response: SessionSummarySchema,
});
export const reviewStatsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/review/stats',
  response: ReviewStatsSchema,
});
export const getReviewSettingsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/settings/review',
  response: ReviewSettingsSchema,
});
export const updateReviewSettingsEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/settings/review',
  body: ReviewSettingsSchema.partial(),
  response: ReviewSettingsSchema,
});
