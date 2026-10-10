import {
  type Confidence,
  EDGE_RELATION_LABELS,
  type EdgeRelation,
  edgeStyleOf,
  type GraphNodeType,
  type MasteryStage,
} from '@skb/core';
import { useNavigate } from '@tanstack/react-router';

/** Opening graph nodes in their own pages, and the small marks that explain edges. */

/** The overlay does not rely on colour alone: each stage has a shape that fills as it is learnt. */
export const STAGE_GLYPHS: Record<MasteryStage, string> = {
  new: '○',
  learning: '◔',
  practised: '◑',
  confident: '◕',
  mastered: '●',
};
export const WEAK_GLYPH = '⚠';

export const NODE_TYPE_LABELS: Record<GraphNodeType, string> = {
  concept: 'Concept',
  note: 'Note',
  source: 'Source',
  lecture: 'Lecture',
  module: 'Module',
  topic: 'Topic',
  code: 'Code',
};

export const NODE_TYPE_PLURALS: Record<GraphNodeType, string> = {
  concept: 'Concepts',
  note: 'Notes',
  source: 'Sources',
  lecture: 'Lectures',
  module: 'Modules',
  topic: 'Topics',
  code: 'Code',
};

/** Whether a node has a page of its own (topics live on their module's page, code in its panel). */
export const hasPage = (type: GraphNodeType) => type !== 'topic' && type !== 'code';

/** Opens a node's page; `relations` jumps to a concept's connections. */
export function useOpenNode() {
  const navigate = useNavigate();
  return (node: { type: GraphNodeType; id: string }, section?: 'relations') => {
    switch (node.type) {
      case 'concept':
        return void navigate({
          to: '/concepts/$conceptId',
          params: { conceptId: node.id },
          ...(section ? { hash: section } : {}),
        });
      case 'note':
        return void navigate({ to: '/notes/$noteId', params: { noteId: node.id } });
      case 'source':
        return void navigate({ to: '/library/$sourceId', params: { sourceId: node.id } });
      case 'lecture':
        return void navigate({ to: '/lectures/$lectureId', params: { lectureId: node.id } });
      case 'module':
        return void navigate({ to: '/modules/$moduleId', params: { moduleId: node.id } });
      case 'topic':
      case 'code':
        return undefined;
    }
  };
}

/** How an edge reads from `from`'s side: "is a prerequisite for" or, backwards, "depends on". */
export function relationPhrase(relation: EdgeRelation, forwards: boolean): string {
  const labels = EDGE_RELATION_LABELS[relation];
  return forwards ? labels.label : labels.inverseLabel;
}

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  USER: 'stated by you',
  EXTRACTED: 'from your files',
  INFERRED: 'inferred',
  AMBIGUOUS: 'ambiguous',
};
export const confidenceLabel = (confidence: Confidence) => CONFIDENCE_LABELS[confidence];

const DASHES = { solid: undefined, dashed: '6 4', dotted: '2 3' } as const;

/** A short line drawn the way the graph draws an edge of this confidence. */
export function EdgeStyleMark({ confidence }: { confidence: Confidence }) {
  return (
    <svg aria-hidden="true" width="24" height="6" className="inline-block shrink-0 text-muted">
      <line
        x1="0"
        y1="3"
        x2="24"
        y2="3"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={DASHES[edgeStyleOf(confidence)]}
      />
    </svg>
  );
}
