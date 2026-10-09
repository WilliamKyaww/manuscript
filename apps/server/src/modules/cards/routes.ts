import {
  bulkCardsEndpoint,
  buryFaceEndpoint,
  createCardEndpoint,
  createCardSetEndpoint,
  deleteCardEndpoint,
  deleteCardSetEndpoint,
  endSessionEndpoint,
  exportCardSetEndpoint,
  getCardEndpoint,
  getCardSetEndpoint,
  getReviewSettingsEndpoint,
  importCardSetEndpoint,
  listCardSetsEndpoint,
  reviewEndpoint,
  reviewQueueEndpoint,
  reviewStatsEndpoint,
  startSessionEndpoint,
  undoReviewEndpoint,
  updateCardEndpoint,
  updateCardSetEndpoint,
  updateReviewSettingsEndpoint,
} from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { SettingsService } from '../settings/service';
import type { ReviewService } from './reviews';
import type { CardsService } from './service';

const ok = { ok: true as const };

export function registerCardRoutes(
  registry: ApiRegistry,
  cards: CardsService,
  reviews: ReviewService,
  settings: SettingsService,
): void {
  registerEndpoint(registry, listCardSetsEndpoint, () => ({ sets: cards.listSets() }));
  registerEndpoint(registry, createCardSetEndpoint, ({ body }) => cards.createSet(body));
  registerEndpoint(registry, getCardSetEndpoint, ({ params }) => cards.getSet(params.id));
  registerEndpoint(registry, updateCardSetEndpoint, ({ params, body }) =>
    cards.updateSet(params.id, body),
  );
  registerEndpoint(registry, deleteCardSetEndpoint, ({ params }) => {
    cards.deleteSet(params.id);
    return ok;
  });
  registerEndpoint(registry, exportCardSetEndpoint, ({ params }) => cards.exportSet(params.id));
  registerEndpoint(registry, importCardSetEndpoint, ({ params, body }) =>
    cards.importSet(params.id, body.content),
  );

  registerEndpoint(registry, createCardEndpoint, ({ body }) => cards.createCard(body));
  registerEndpoint(registry, getCardEndpoint, ({ params }) => cards.getCard(params.id));
  registerEndpoint(registry, updateCardEndpoint, ({ params, body }) =>
    cards.updateCard(params.id, body),
  );
  registerEndpoint(registry, deleteCardEndpoint, ({ params }) => {
    cards.deleteCard(params.id);
    return ok;
  });
  registerEndpoint(registry, bulkCardsEndpoint, ({ body }) => ({
    changed: cards.bulk(body.ids, body.action, body.setId),
  }));
  registerEndpoint(registry, buryFaceEndpoint, ({ params, body }) => {
    reviews.bury(params.id, body.ordinal);
    return ok;
  });

  registerEndpoint(registry, reviewQueueEndpoint, ({ query }) =>
    reviews.queue({ setId: query.set, moduleId: query.module }, query.limit),
  );
  registerEndpoint(registry, reviewEndpoint, ({ body }) => reviews.rate(body));
  registerEndpoint(registry, undoReviewEndpoint, ({ body }) => ({
    item: reviews.undo(body.sessionId),
  }));
  registerEndpoint(registry, startSessionEndpoint, ({ body }) => reviews.startSession(body));
  registerEndpoint(registry, endSessionEndpoint, ({ params }) => reviews.endSession(params.id));
  registerEndpoint(registry, reviewStatsEndpoint, () => reviews.stats());
  registerEndpoint(registry, getReviewSettingsEndpoint, () => settings.review());
  registerEndpoint(registry, updateReviewSettingsEndpoint, ({ body }) =>
    settings.updateReview(body),
  );
}
