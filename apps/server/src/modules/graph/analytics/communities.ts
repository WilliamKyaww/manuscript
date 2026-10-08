/*
 * Adapted from Graphify, graphify/cluster.py (`cluster`, `_split_community`, `cohesion_score`,
 * `label_communities_by_hub`, `remap_communities_to_previous`), release 0.9.75.
 * Copyright 2026 Safi Shamsi and the Graphify contributors. Licensed under the Apache License,
 * Version 2.0; see THIRD_PARTY_NOTICES.md.
 * Modified for Manuscript: translated to TypeScript on graphology with seeded Louvain (Graphify
 * prefers Leiden); the oversized limit is measured against connected nodes rather than all nodes;
 * nodes left on their own get no community instead of a singleton one; labels prefer concepts.
 */

import { UndirectedGraph } from 'graphology';
import louvain from 'graphology-communities-louvain';
import { seededRandom } from './random';

/** Communities larger than this share of the connected nodes are split again. */
export const MAX_COMMUNITY_FRACTION = 0.25;
/** …but only if they have at least this many members. */
export const MIN_SPLIT_SIZE = 10;
/** Communities this loosely connected are split again… */
export const COHESION_SPLIT_THRESHOLD = 0.05;
/** …once they have at least this many members. */
export const COHESION_SPLIT_MIN_SIZE = 50;

const SEED = 42;

/** Code-point order: unlike `localeCompare`, the same on every machine. */
export const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type View = UndirectedGraph<object, { weight: number }>;

function subgraph(view: View, members: readonly string[]): View {
  const keep = new Set(members);
  const sub: View = new UndirectedGraph();
  for (const node of [...members].sort()) sub.addNode(node);
  view.forEachEdge((_edge, attributes, source, target) => {
    if (keep.has(source) && keep.has(target)) sub.addEdge(source, target, { ...attributes });
  });
  return sub;
}

/** Louvain groups of a graph with edges, members sorted. */
function partition(graph: View): string[][] {
  if (graph.size === 0) return graph.nodes().map((node) => [node]);
  const mapping = louvain(graph, {
    getEdgeWeight: 'weight',
    rng: seededRandom(SEED),
    resolution: 1,
  });
  const groups = new Map<number, string[]>();
  for (const node of graph.nodes()) {
    const community = mapping[node] ?? -1;
    groups.set(community, [...(groups.get(community) ?? []), node]);
  }
  return [...groups.values()].map((members) => members.sort());
}

function split(view: View, members: readonly string[]): string[][] {
  const parts = partition(subgraph(view, members));
  return parts.length > 1 ? parts : [[...members].sort()];
}

/** Edges inside a group over the most it could have (1 for a group of one). */
export function cohesion(view: View, members: readonly string[]): number {
  const n = members.length;
  if (n <= 1) return 1;
  const keep = new Set(members);
  let actual = 0;
  for (const node of members)
    view.forEachNeighbor(node, (neighbour) => {
      if (keep.has(neighbour) && node < neighbour) actual += 1;
    });
  return actual / ((n * (n - 1)) / 2);
}

/**
 * Communities of the connected nodes: Louvain, then oversized and loosely knit communities split
 * again. Returned largest first (ties by members), so the same grouping always comes out in the
 * same order. Groups of one are dropped: an unconnected node belongs to no community.
 */
export function detectCommunities(view: View): string[][] {
  const connected = view.filterNodes((node) => view.degree(node) > 0).sort();
  if (connected.length === 0) return [];
  const raw = partition(subgraph(view, connected));
  const maxSize = Math.max(MIN_SPLIT_SIZE, Math.floor(connected.length * MAX_COMMUNITY_FRACTION));
  const sized = raw.flatMap((members) =>
    members.length > maxSize ? split(view, members) : [members],
  );
  const cohesive = sized.flatMap((members) =>
    members.length >= COHESION_SPLIT_MIN_SIZE && cohesion(view, members) < COHESION_SPLIT_THRESHOLD
      ? split(view, members)
      : [members],
  );
  return cohesive
    .filter((members) => members.length > 1)
    .sort((a, b) => b.length - a.length || compareIds(a.join(' '), b.join(' ')));
}

/**
 * Community ids that keep their colour between rebuilds: each new community takes the id of the
 * previous community it overlaps most (greedily, largest overlap first); the rest take the
 * smallest free ids, largest community first. Returns the id for each index of `communities`.
 */
export function stableIds(
  communities: readonly (readonly string[])[],
  previous: ReadonlyMap<string, number>,
): number[] {
  const overlaps: { overlap: number; old: number; index: number }[] = [];
  communities.forEach((members, index) => {
    const counts = new Map<number, number>();
    for (const node of members) {
      const old = previous.get(node);
      if (old !== undefined) counts.set(old, (counts.get(old) ?? 0) + 1);
    }
    for (const [old, overlap] of counts) overlaps.push({ overlap, old, index });
  });
  overlaps.sort((a, b) => b.overlap - a.overlap || a.old - b.old || a.index - b.index);
  const ids: (number | undefined)[] = communities.map(() => undefined);
  const used = new Set<number>();
  for (const { old, index } of overlaps) {
    if (used.has(old) || ids[index] !== undefined) continue;
    ids[index] = old;
    used.add(old);
  }
  let next = 0;
  return ids.map((id) => {
    if (id !== undefined) return id;
    while (used.has(next)) next += 1;
    used.add(next);
    return next;
  });
}

/**
 * The member a community is named after: its best-connected concept if it has concepts (concept
 * names make better cluster names than note titles), otherwise its best-connected member; ties go
 * to the alphabetically first label, then id.
 */
export function communityHub(
  view: View,
  members: readonly string[],
  describe: (node: string) => { type: string; label: string },
): string {
  const concepts = members.filter((node) => describe(node).type === 'concept');
  const candidates = concepts.length > 0 ? concepts : members;
  return [...candidates].sort(
    (a, b) =>
      view.degree(b) - view.degree(a) ||
      describe(a).label.localeCompare(describe(b).label, 'en') ||
      compareIds(a, b),
  )[0] as string;
}
