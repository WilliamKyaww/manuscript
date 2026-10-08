import { listRecentEndpoint, recordRecentEndpoint, searchEndpoint } from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { SearchService } from './service';

export function registerSearchRoutes(registry: ApiRegistry, search: SearchService): void {
  registerEndpoint(registry, searchEndpoint, ({ query }) =>
    search.search(query.q, { limit: query.limit, offset: query.offset }),
  );
  registerEndpoint(registry, recordRecentEndpoint, ({ body }) => {
    search.recordRecent(body.kind, body.id);
    return { ok: true as const };
  });
  registerEndpoint(registry, listRecentEndpoint, ({ query }) => ({
    items: search.recent(query.limit),
  }));
}
