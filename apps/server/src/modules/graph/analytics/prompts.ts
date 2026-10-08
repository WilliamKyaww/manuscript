/*
 * Adapted from Graphify, graphify/analyze.py (`suggest_questions`), release 0.9.75.
 * Copyright 2026 Safi Shamsi and the Graphify contributors. Licensed under the Apache License,
 * Version 2.0; see THIRD_PARTY_NOTICES.md.
 * Modified for Manuscript: translated to TypeScript and turned from questions about a codebase into
 * study prompts with actions — inferred or ambiguous relations to check, concepts with no
 * connections, bridges between clusters, surprising connections and loosely knit clusters.
 */

import { EDGE_RELATION_LABELS, type NodeRef, RELATIONS, type StudyPrompt } from '@skb/core';
import type { KnowledgeGraph } from '../assemble';

/** Loosely knit clusters at least this big are worth a prompt. */
export const LOW_COHESION = 0.15;
export const LOW_COHESION_MIN_SIZE = 5;
export const MAX_PROMPTS = 12;
const PER_KIND = 3;

export interface PromptInputs {
  graph: KnowledgeGraph;
  degree: (node: string) => number;
  isolated: readonly string[];
  bridges: readonly { node: string; communities: readonly number[] }[];
  surprising: readonly { edge: string; reasons: readonly string[] }[];
  communities: readonly {
    id: number;
    label: string;
    size: number;
    cohesion: number;
    hub: string;
  }[];
  /** Relations to check are limited to those touching these nodes (all when absent). */
  include?: (node: string) => boolean;
}

const quote = (text: string) => `“${text}”`;
const sentence = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;

export function studyPrompts(inputs: PromptInputs): StudyPrompt[] {
  const { graph } = inputs;
  const ref = (node: string): NodeRef => ({
    type: graph.getNodeAttribute(node, 'type'),
    id: node,
    label: graph.getNodeAttribute(node, 'label'),
  });
  const name = (node: string) => quote(graph.getNodeAttribute(node, 'label'));
  const communityName = (id: number) =>
    quote(inputs.communities.find((community) => community.id === id)?.label ?? `Cluster ${id}`);

  // 1. Relations the student has not stated: check them (Graphify: AMBIGUOUS edges first).
  const toVerify: { ambiguous: boolean; prompt: StudyPrompt }[] = [];
  graph.forEachEdge((edge, attributes, source, target) => {
    if (attributes.kind !== 'relation' || attributes.relationId === null) return;
    if (attributes.confidence !== 'INFERRED' && attributes.confidence !== 'AMBIGUOUS') return;
    if (inputs.include && !inputs.include(source) && !inputs.include(target)) return;
    const relation = attributes.relation as keyof typeof RELATIONS;
    const ambiguous = attributes.confidence === 'AMBIGUOUS';
    toVerify.push({
      ambiguous,
      prompt: {
        id: `verify:${edge}`,
        kind: 'verify',
        title: `Check: ${name(source)} ${RELATIONS[relation].label} ${name(target)}`,
        detail: ambiguous
          ? 'Marked ambiguous. Accept it, change it or reject it.'
          : `Inferred${attributes.score === null ? '' : ` (score ${attributes.score})`}, not stated in your material. Accept it, change it or reject it.`,
        actions: [{ label: 'Review relation', node: ref(source), view: 'relations' }],
      },
    });
  });
  // Ambiguous first (Graphify's order), otherwise in edge order.
  const verify = toVerify
    .sort((a, b) => Number(b.ambiguous) - Number(a.ambiguous))
    .map(({ prompt }) => prompt);

  // 2. Concepts with no or one connection: knowledge gaps.
  const gaps: StudyPrompt[] = inputs.isolated.map((node) => ({
    id: `gap:${node}`,
    kind: 'gap',
    title: `Connect ${name(node)}`,
    detail:
      inputs.degree(node) === 0
        ? 'Nothing links to it yet: write about it in a note, or relate it to concepts you know.'
        : 'Only one connection so far: relate it to the ideas around it.',
    actions: [{ label: 'Open concept', node: ref(node), view: 'page' }],
  }));

  // 3. Bridges between clusters: integrative or essay questions.
  const bridging: StudyPrompt[] = inputs.bridges.map(({ node, communities }) => ({
    id: `bridge:${node}`,
    kind: 'bridge',
    title: `Explain how ${name(node)} links ${communities.slice(0, 3).map(communityName).join(' and ')}`,
    detail:
      'It sits between clusters that are otherwise far apart: a good integrative or essay question.',
    actions: [
      { label: 'Show in graph', node: ref(node), view: 'graph' },
      { label: 'Open', node: ref(node), view: 'page' },
    ],
  }));

  // 4. Surprising connections.
  const surprising: StudyPrompt[] = inputs.surprising.map(({ edge, reasons }) => {
    const source = graph.source(edge);
    const target = graph.target(edge);
    const relation = EDGE_RELATION_LABELS[graph.getEdgeAttribute(edge, 'relation')].label;
    return {
      id: `surprising:${edge}`,
      kind: 'surprising',
      title: `A connection you might have missed: ${name(source)} ${relation} ${name(target)}`,
      detail: sentence(reasons.join('; ')),
      actions: [
        { label: 'Show in graph', node: ref(source), view: 'graph' },
        { label: 'Open', node: ref(target), view: 'page' },
      ],
    };
  });

  // 5. Loosely knit clusters.
  const cohesion: StudyPrompt[] = inputs.communities
    .filter(
      (community) => community.size >= LOW_COHESION_MIN_SIZE && community.cohesion < LOW_COHESION,
    )
    .map((community) => ({
      id: `cohesion:${community.id}:${community.hub}`,
      kind: 'cohesion',
      title: `Tie together the ${quote(community.label)} cluster`,
      detail: `Its ${community.size} members are loosely connected (cohesion ${community.cohesion.toFixed(2)}): relate them to each other, or check that they belong together.`,
      actions: [{ label: 'Show in graph', node: ref(community.hub), view: 'graph' }],
    }));

  // Interleave so one kind cannot crowd out the others.
  const kinds = [verify, gaps, bridging, surprising, cohesion].map((prompts) =>
    prompts.slice(0, PER_KIND),
  );
  const prompts: StudyPrompt[] = [];
  for (let round = 0; round < PER_KIND; round += 1)
    for (const list of kinds) {
      const prompt = list[round];
      if (prompt) prompts.push(prompt);
    }
  return prompts.slice(0, MAX_PROMPTS);
}
