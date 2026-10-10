import type { Confidence, EdgeKind, EdgeRelation, GraphNodeType, RelationStatus } from '@skb/core';
import { STRUCTURAL_NODE_TYPES } from '@skb/core';
import { MultiDirectedGraph, UndirectedGraph } from 'graphology';
import type { GraphData } from './graph-repository';

/**
 * Assembles the knowledge graph (task 7.03, knowledge-system.md §7.1) from what the vault and the
 * database hold: concepts, notes, sources, lectures, modules and topics as nodes; stored relations,
 * links written in notes, and membership in the course structure as edges. Pure: the same data
 * always gives the same graph, built in id order.
 */

export interface NodeAttributes {
  type: GraphNodeType;
  label: string;
  /** Module codes as written, and the module ids behind them. */
  modules: string[];
  moduleIds: string[];
  path: string | null;
}

export interface EdgeAttributes {
  relation: EdgeRelation;
  kind: EdgeKind;
  confidence: Confidence;
  status: RelationStatus;
  score: number | null;
  weight: number;
  relationId: string | null;
}

export type KnowledgeGraph = MultiDirectedGraph<NodeAttributes, EdgeAttributes>;

const STRUCTURAL = new Set<GraphNodeType>(STRUCTURAL_NODE_TYPES);

export const isStructural = (type: GraphNodeType) => STRUCTURAL.has(type);

export function assembleGraph(data: GraphData): KnowledgeGraph {
  const graph: KnowledgeGraph = new MultiDirectedGraph();
  const modules = new Map(data.modules.map((module) => [module.id, module]));
  const moduleByCode = new Map(data.modules.map((module) => [module.code.toLowerCase(), module]));
  const topicModule = new Map(data.topics.map((topic) => [topic.id, topic.moduleId]));

  const membership = (moduleIds: Iterable<string>) => {
    const ids = [...new Set(moduleIds)].filter((id) => modules.has(id)).sort();
    return { moduleIds: ids, modules: ids.map((id) => modules.get(id)?.code ?? id) };
  };
  const byCode = (code: string | null) => {
    const module = code ? moduleByCode.get(code.toLowerCase()) : undefined;
    return membership(module ? [module.id] : []);
  };

  const edge = (
    id: string,
    source: string,
    target: string,
    attributes: Omit<EdgeAttributes, 'status' | 'score' | 'relationId'> &
      Partial<Pick<EdgeAttributes, 'status' | 'score' | 'relationId'>>,
  ) => {
    if (source === target || !graph.hasNode(source) || !graph.hasNode(target)) return;
    if (graph.hasEdge(id)) return;
    graph.addDirectedEdgeWithKey(id, source, target, {
      status: 'accepted',
      score: null,
      relationId: null,
      ...attributes,
    });
  };
  const partOf = (child: string, parent: string) =>
    edge(`part_of:${child}:${parent}`, child, parent, {
      relation: 'part_of',
      kind: 'structure',
      confidence: 'USER',
      weight: 1,
    });

  // Nodes.
  for (const module of data.modules)
    graph.addNode(module.id, {
      type: 'module',
      label: `${module.code} ${module.title}`,
      ...membership([module.id]),
      path: null,
    });
  for (const topic of data.topics)
    graph.addNode(topic.id, {
      type: 'topic',
      label: topic.title,
      ...membership([topic.moduleId]),
      path: null,
    });
  for (const lecture of data.lectures)
    graph.addNode(lecture.id, {
      type: 'lecture',
      label: `${lecture.key} ${lecture.title}`,
      ...membership([lecture.moduleId]),
      path: null,
    });
  for (const concept of data.concepts)
    graph.addNode(concept.id, {
      type: 'concept',
      label: concept.name,
      ...membership([
        ...concept.moduleIds,
        ...concept.topicIds.flatMap((id) => topicModule.get(id) ?? []),
      ]),
      path: null,
    });
  for (const note of data.notes)
    graph.addNode(note.id, {
      type: 'note',
      label: note.title,
      ...byCode(note.moduleCode),
      path: note.path,
    });
  for (const source of data.sources)
    graph.addNode(source.id, {
      type: 'source',
      label: source.title,
      ...byCode(source.moduleCode),
      path: source.path,
    });

  for (const entity of data.code.entities)
    graph.addNode(entity.id, {
      type: 'code',
      label: entity.label,
      ...membership(entity.moduleId ? [entity.moduleId] : []),
      path: entity.file,
    });

  // Course structure.
  for (const lecture of data.lectures) partOf(lecture.id, lecture.moduleId);
  for (const topic of data.topics) partOf(topic.id, topic.parentId ?? topic.moduleId);
  for (const concept of data.concepts) {
    for (const topicId of concept.topicIds) partOf(concept.id, topicId);
    const viaTopics = new Set(concept.topicIds.map((id) => topicModule.get(id)));
    for (const moduleId of concept.moduleIds)
      if (!viaTopics.has(moduleId)) partOf(concept.id, moduleId);
  }
  const lectureByKey = new Map(
    data.lectures.map((lecture) => [
      `${modules.get(lecture.moduleId)?.code.toLowerCase()}/${lecture.key.toLowerCase()}`,
      lecture.id,
    ]),
  );
  for (const note of data.notes) {
    const lectureId = noteLecture(note, lectureByKey);
    if (lectureId) partOf(note.id, lectureId);
    else {
      const [moduleId] = byCode(note.moduleCode).moduleIds;
      if (moduleId) partOf(note.id, moduleId);
    }
  }
  const attached = new Set<string>();
  for (const { lectureId, sourceId } of data.lectureSources) {
    partOf(sourceId, lectureId);
    attached.add(sourceId);
  }
  for (const source of data.sources) {
    const [moduleId] = byCode(source.moduleCode).moduleIds;
    if (moduleId && !attached.has(source.id)) partOf(source.id, moduleId);
  }

  // Links written in notes, and backing notes.
  const sourceByPath = new Map(data.sources.map((source) => [source.path, source.id]));
  for (const link of data.links) {
    if (link.kind === 'concept')
      edge(`mentioned_in:${link.target}:${link.fromNote}`, link.target, link.fromNote, {
        relation: 'mentioned_in',
        kind: 'link',
        confidence: 'EXTRACTED',
        weight: link.count,
      });
    else {
      const target = link.kind === 'note' ? link.target : sourceByPath.get(link.target);
      if (target)
        edge(`links_to:${link.fromNote}:${target}`, link.fromNote, target, {
          relation: 'links_to',
          kind: 'link',
          confidence: 'EXTRACTED',
          weight: link.count,
        });
    }
  }
  for (const concept of data.concepts)
    if (concept.noteId)
      edge(`covered_in:${concept.id}:${concept.noteId}`, concept.id, concept.noteId, {
        relation: 'covered_in',
        kind: 'link',
        confidence: 'USER',
        weight: 1,
      });

  // Imported code: what uses what (Graphify's "contains" is structure), and what implements a concept.
  for (const link of data.code.edges) {
    if (link.relation === 'contains')
      edge(`code:${link.id}`, link.targetId, link.sourceId, {
        relation: 'part_of',
        kind: 'structure',
        confidence: link.confidence,
        score: link.score,
        weight: link.weight,
      });
    else
      edge(`code:${link.id}`, link.sourceId, link.targetId, {
        relation: 'uses',
        kind: 'link',
        confidence: link.confidence,
        score: link.score,
        weight: link.weight,
      });
  }
  for (const link of data.code.links)
    edge(`implemented_in:${link.conceptId}:${link.entityId}`, link.conceptId, link.entityId, {
      relation: 'implemented_in',
      kind: 'link',
      confidence: link.status === 'accepted' ? 'USER' : 'INFERRED',
      status: link.status,
      score: link.score,
      weight: 1,
    });

  // Stored relations (accepted and proposed; rejected ones are never drawn).
  for (const relation of data.relations)
    edge(relation.id, relation.fromId, relation.toId, {
      relation: relation.relation,
      kind: 'relation',
      confidence: relation.confidence,
      status: relation.status,
      score: relation.score,
      weight: 1,
      relationId: relation.id,
    });

  return graph;
}

/** The lecture a note names in its `lecture` property (`COC251/L03`, or `L03` with `module`). */
function noteLecture(
  note: GraphData['notes'][number],
  lectureByKey: ReadonlyMap<string, string>,
): string | undefined {
  if (!note.lectureKey) return undefined;
  const key = note.lectureKey.toLowerCase();
  return (
    lectureByKey.get(key) ??
    (note.moduleCode ? lectureByKey.get(`${note.moduleCode.toLowerCase()}/${key}`) : undefined)
  );
}

/** Whether an edge counts for analytics: accepted, and not course structure. */
export const isSemantic = (attributes: EdgeAttributes) =>
  attributes.kind !== 'structure' && attributes.status === 'accepted';

/**
 * The graph analytics work on: knowledge nodes (not modules, lectures or topics) joined by
 * accepted, non-structural edges, undirected, with parallel edges merged and their weights added.
 */
export function semanticView(graph: KnowledgeGraph): UndirectedGraph<object, { weight: number }> {
  const view = new UndirectedGraph<object, { weight: number }>();
  graph.forEachNode((node, attributes) => {
    // Code is shown, not analysed: a repository's calls would drown the ideas in communities and hubs.
    if (!isStructural(attributes.type) && attributes.type !== 'code') view.addNode(node);
  });
  graph.forEachEdge((_edge, attributes, source, target) => {
    if (!isSemantic(attributes) || !view.hasNode(source) || !view.hasNode(target)) return;
    if (view.hasEdge(source, target))
      view.updateEdgeAttribute(
        source,
        target,
        'weight',
        (weight = 0) => weight + attributes.weight,
      );
    else view.addEdge(source, target, { weight: attributes.weight });
  });
  return view;
}
