import {
  createRelationEndpoint,
  deleteRelationEndpoint,
  graphEndpoint,
  graphPathEndpoint,
  graphReportEndpoint,
  listRelationsEndpoint,
  localGraphEndpoint,
  updateRelationEndpoint,
} from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { RelationsService } from './relations';
import type { GraphService } from './service';

export function registerGraphRoutes(
  registry: ApiRegistry,
  graph: GraphService,
  relations: RelationsService,
): void {
  registerEndpoint(registry, listRelationsEndpoint, ({ query }) => ({
    relations: relations.listFor(query.node, query.status),
  }));
  registerEndpoint(registry, createRelationEndpoint, ({ body }) => relations.create(body));
  registerEndpoint(registry, updateRelationEndpoint, ({ params, body }) =>
    relations.update(params.id, body),
  );
  registerEndpoint(registry, deleteRelationEndpoint, ({ params }) => {
    relations.remove(params.id);
    return { ok: true as const };
  });

  registerEndpoint(registry, graphEndpoint, ({ query }) => graph.graph(query));
  registerEndpoint(registry, localGraphEndpoint, ({ query }) => {
    const { node, depth, ...filter } = query;
    return graph.local(node, depth, filter);
  });
  registerEndpoint(registry, graphPathEndpoint, ({ query }) =>
    graph.path(query.from, query.to, query.via),
  );
  registerEndpoint(registry, graphReportEndpoint, ({ query }) => graph.report(query.module));
}
