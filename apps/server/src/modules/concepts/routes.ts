import {
  createConceptEndpoint,
  deleteConceptEndpoint,
  getConceptEndpoint,
  listConceptsEndpoint,
  updateConceptEndpoint,
} from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { ConceptsService } from './service';

export function registerConceptRoutes(registry: ApiRegistry, concepts: ConceptsService): void {
  registerEndpoint(registry, listConceptsEndpoint, () => ({ concepts: concepts.list() }));
  registerEndpoint(registry, createConceptEndpoint, ({ body }) => concepts.create(body));
  registerEndpoint(registry, getConceptEndpoint, ({ params }) => concepts.get(params.id));
  registerEndpoint(registry, updateConceptEndpoint, ({ params, body }) =>
    concepts.update(params.id, body),
  );
  registerEndpoint(registry, deleteConceptEndpoint, ({ params }) => {
    concepts.remove(params.id);
    return { ok: true as const };
  });
}
