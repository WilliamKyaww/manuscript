import {
  createRelationEndpoint,
  crossModuleConnections,
  deleteRelationEndpoint,
  type GraphPayload,
  graphConnectionsEndpoint,
  graphEndpoint,
  graphPathEndpoint,
  graphReportEndpoint,
  listRelationsEndpoint,
  localGraphEndpoint,
  updateRelationEndpoint,
} from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { MasteryService } from '../mastery/service';
import type { RelationsService } from './relations';
import type { GraphService } from './service';

export function registerGraphRoutes(
  registry: ApiRegistry,
  graph: GraphService,
  relations: RelationsService,
  mastery: MasteryService,
): void {
  /** Concept nodes with how well the student knows them, for the mastery overlay (task 15.04). */
  const withMastery = (payload: GraphPayload): GraphPayload => {
    if (!payload.nodes.some((node) => node.type === 'concept')) return payload;
    const byId = new Map(mastery.concepts().map((row) => [row.concept.id as string, row]));
    return {
      ...payload,
      nodes: payload.nodes.map((node) => {
        const row = node.type === 'concept' ? byId.get(node.id) : undefined;
        return row
          ? {
              ...node,
              mastery: {
                stage: row.components.stage,
                value: row.components.mastery,
                weak: row.signals.some((signal) => signal.kind !== 'no_material'),
              },
            }
          : node;
      }),
    };
  };

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

  registerEndpoint(registry, graphEndpoint, ({ query }) => withMastery(graph.graph(query)));
  registerEndpoint(registry, localGraphEndpoint, ({ query }) => {
    const { node, depth, ...filter } = query;
    return withMastery(graph.local(node, depth, filter));
  });
  registerEndpoint(registry, graphPathEndpoint, ({ query }) =>
    graph.path(query.from, query.to, query.via),
  );
  registerEndpoint(registry, graphConnectionsEndpoint, ({ query }) => {
    const concepts = graph.graph(
      graphEndpoint.schemas.query.parse({ types: 'concept', limit: 20_000 }),
    );
    return crossModuleConnections(concepts, query.limit);
  });
  registerEndpoint(registry, graphReportEndpoint, ({ query }) => graph.report(query.module));
}
