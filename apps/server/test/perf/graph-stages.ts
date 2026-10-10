/**
 * Times the stages of building the knowledge graph on a synthetic graph the size of the
 * performance vault (10,000 notes with about six links each, 1,000 concepts, 2,000 relations), to
 * see where a first build spends its time. Run with `npx tsx apps/server/test/perf/graph-stages.ts`.
 */

import { analyseGraph } from '../../src/modules/graph/analytics/analyse';
import { betweenness } from '../../src/modules/graph/analytics/centrality';
import { detectCommunities } from '../../src/modules/graph/analytics/communities';
import { assembleGraph, semanticView } from '../../src/modules/graph/assemble';
import type { GraphData } from '../../src/modules/graph/graph-repository';

function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const next = random(1);
const NOTES = Number(process.argv[2] ?? 10_000);
const data: GraphData = {
  modules: Array.from({ length: 50 }, (_, i) => ({
    id: `mod_${i}`,
    code: `COC${200 + i}`,
    title: `Module ${i}`,
  })),
  topics: [],
  lectures: [],
  concepts: Array.from({ length: 1_000 }, (_, i) => ({
    id: `con_${i}`,
    name: `Concept ${i}`,
    noteId: null,
    moduleIds: [`mod_${i % 50}`],
    topicIds: [],
  })),
  notes: Array.from({ length: NOTES }, (_, i) => ({
    id: `note_${i}`,
    title: `Note ${i}`,
    path: `Module ${i % 50}/Note ${i}.md`,
    moduleCode: `COC${200 + (i % 50)}`,
    lectureKey: null,
  })),
  links: Array.from({ length: NOTES * 6 }, (_, i) => ({
    fromNote: `note_${Math.floor(i / 6)}`,
    kind: 'note' as const,
    target: `note_${Math.floor(next() * NOTES)}`,
    count: 1,
  })),
  sources: [],
  lectureSources: [],
  code: { entities: [], edges: [], links: [] },
  relations: Array.from({ length: 2_000 }, (_, i) => ({
    id: `rel_${i}`,
    fromType: 'concept' as const,
    fromId: `con_${Math.floor(i / 2)}`,
    toType: 'concept' as const,
    toId: `con_${Math.floor(next() * 1_000)}`,
    relation: 'relates_to' as const,
    confidence: 'USER' as const,
    score: null,
    status: 'accepted' as const,
    evidenceJson: '[]',
    createdBy: 'user' as const,
    createdAt: '',
    updatedAt: '',
  })),
};

const time = <T>(label: string, run: () => T): T => {
  const started = performance.now();
  const result = run();
  console.log(`${label.padEnd(28)} ${Math.round(performance.now() - started)} ms`);
  return result;
};

const graph = time('assemble', () => assembleGraph(data));
const view = time('semantic view', () => semanticView(graph));
time('communities', () => detectCommunities(view));
time('betweenness (sampled)', () => betweenness(view));
time('whole analysis', () => analyseGraph(graph, new Map()));
console.log(
  `${graph.order} nodes, ${graph.size} edges; view ${view.order} nodes, ${view.size} edges`,
);
