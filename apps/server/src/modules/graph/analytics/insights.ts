/*
 * The surprise score (`surprisingConnections`) is adapted from Graphify, graphify/analyze.py
 * (`_surprise_score`, `_cross_community_surprises`), release 0.9.75.
 * Copyright 2026 Safi Shamsi and the Graphify contributors. Licensed under the Apache License,
 * Version 2.0; see THIRD_PARTY_NOTICES.md.
 * Modified for Manuscript: translated to TypeScript; Graphify's cross-file-type and cross-repo
 * signals become "connects different modules"; only edges with a structural signal are kept, and
 * one is kept per pair of communities (or modules).
 */

import type { UndirectedGraph } from 'graphology';
import { isSemantic, isStructural, type KnowledgeGraph } from '../assemble';
import { compareIds } from './communities';

/** How many of each finding a report shows, after narrowing to a module. */
export const LIMITS = { core: 10, isolated: 50, bridges: 5, surprising: 5 } as const;
/** How many the analysis keeps, so a module's report still has enough to choose from. */
const KEEP = 500;

const byLabel = (graph: KnowledgeGraph) => (a: string, b: string) =>
  graph.getNodeAttribute(a, 'label').localeCompare(graph.getNodeAttribute(b, 'label'), 'en') ||
  compareIds(a, b);

/** The best-connected concepts: "know these first". */
export function coreConcepts(graph: KnowledgeGraph, view: UndirectedGraph) {
  return view
    .filterNodes(
      (node) => graph.getNodeAttribute(node, 'type') === 'concept' && view.degree(node) > 0,
    )
    .sort((a, b) => view.degree(b) - view.degree(a) || byLabel(graph)(a, b))
    .slice(0, KEEP)
    .map((node) => ({ node, degree: view.degree(node) }));
}

/** Concepts with at most one connection: gaps to write about or relate. */
export function isolatedConcepts(graph: KnowledgeGraph, view: UndirectedGraph): string[] {
  return view
    .filterNodes(
      (node) => graph.getNodeAttribute(node, 'type') === 'concept' && view.degree(node) <= 1,
    )
    .sort((a, b) => view.degree(a) - view.degree(b) || byLabel(graph)(a, b))
    .slice(0, KEEP);
}

/** Nodes on many shortest paths that join different communities: integrative questions. */
export function bridges(
  graph: KnowledgeGraph,
  view: UndirectedGraph,
  centrality: ReadonlyMap<string, number>,
  communityOf: ReadonlyMap<string, number>,
) {
  const found: { node: string; score: number; communities: number[] }[] = [];
  for (const [node, score] of centrality) {
    if (score <= 0) continue;
    const communities = new Set<number>();
    const own = communityOf.get(node);
    if (own !== undefined) communities.add(own);
    view.forEachNeighbor(node, (neighbour) => {
      const community = communityOf.get(neighbour);
      if (community !== undefined) communities.add(community);
    });
    if (communities.size >= 2)
      found.push({ node, score, communities: [...communities].sort((a, b) => a - b) });
  }
  return found.sort((a, b) => b.score - a.score || byLabel(graph)(a.node, b.node)).slice(0, KEEP);
}

const CONFIDENCE_BONUS = { AMBIGUOUS: 3, INFERRED: 2, EXTRACTED: 1, USER: 1 } as const;

/** Connections that cut across modules or clusters, scored as Graphify scores surprising edges. */
export function surprisingConnections(
  graph: KnowledgeGraph,
  view: UndirectedGraph,
  communityOf: ReadonlyMap<string, number>,
  communityLabel: (community: number) => string,
) {
  const label = (node: string) => `“${graph.getNodeAttribute(node, 'label')}”`;
  const candidates: { edge: string; score: number; reasons: string[]; pair: string }[] = [];
  graph.forEachEdge((edge, attributes, source, target) => {
    if (!isSemantic(attributes)) return;
    if (
      isStructural(graph.getNodeAttribute(source, 'type')) ||
      isStructural(graph.getNodeAttribute(target, 'type'))
    )
      return;
    let score = CONFIDENCE_BONUS[attributes.confidence];
    const reasons: string[] = [];
    let structural = false;
    if (attributes.confidence === 'AMBIGUOUS') reasons.push('marked ambiguous');
    if (attributes.confidence === 'INFERRED') reasons.push('inferred, not stated in your material');

    const sourceModules = graph.getNodeAttribute(source, 'modules');
    const targetModules = graph.getNodeAttribute(target, 'modules');
    if (
      sourceModules.length > 0 &&
      targetModules.length > 0 &&
      !sourceModules.some((code) => targetModules.includes(code))
    ) {
      score += 2;
      structural = true;
      reasons.push(`connects ${sourceModules.join(', ')} with ${targetModules.join(', ')}`);
    }
    const sourceCommunity = communityOf.get(source);
    const targetCommunity = communityOf.get(target);
    if (
      sourceCommunity !== undefined &&
      targetCommunity !== undefined &&
      sourceCommunity !== targetCommunity
    ) {
      score += 1;
      structural = true;
      reasons.push(
        `bridges the “${communityLabel(sourceCommunity)}” and “${communityLabel(targetCommunity)}” clusters`,
      );
    }
    const sourceDegree = view.degree(source);
    const targetDegree = view.degree(target);
    if (Math.min(sourceDegree, targetDegree) <= 2 && Math.max(sourceDegree, targetDegree) >= 5) {
      score += 1;
      structural = true;
      const [peripheral, hub] = sourceDegree <= 2 ? [source, target] : [target, source];
      reasons.push(`${label(peripheral)}, barely connected, reaches the hub ${label(hub)}`);
    }
    if (!structural) return;
    const pair =
      sourceCommunity !== undefined && targetCommunity !== undefined
        ? `c:${Math.min(sourceCommunity, targetCommunity)}:${Math.max(sourceCommunity, targetCommunity)}`
        : `m:${[sourceModules.join(','), targetModules.join(',')].sort().join('|')}:${[source, target].sort().join('|')}`;
    candidates.push({ edge, score, reasons, pair });
  });
  candidates.sort((a, b) => b.score - a.score || compareIds(a.edge, b.edge));
  const seen = new Set<string>();
  const kept: { edge: string; score: number; reasons: string[] }[] = [];
  for (const { pair, ...candidate } of candidates) {
    if (seen.has(pair)) continue;
    seen.add(pair);
    kept.push(candidate);
    if (kept.length === KEEP) break;
  }
  return kept;
}
