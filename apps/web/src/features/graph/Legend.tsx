import { type Community, type GraphNodeType, MASTERY_STAGES } from '@skb/core';
import { cn } from '../../lib/cn';
import { STAGE_LABELS } from '../practice/format';
import { EdgeStyleMark, NODE_TYPE_PLURALS, STAGE_GLYPHS, WEAK_GLYPH } from './nodes';

/**
 * The graph's key: clusters (each can be hidden) or node types, and what the line styles mean.
 * Swatches use the same tokens as the canvas, so they match in both themes.
 */

const MAX_CLUSTERS = 12;

/** Matches the canvas: community n takes palette colour n mod 10. */
export const communityColour = (id: number) => `var(--skb-graph-${(id % 10) + 1})`;

const TYPE_COLOURS: [GraphNodeType, string][] = [
  ['concept', 'var(--skb-graph-1)'],
  ['note', 'var(--skb-graph-3)'],
  ['source', 'var(--skb-graph-2)'],
  ['lecture', 'var(--skb-graph-4)'],
  ['topic', 'var(--skb-graph-5)'],
  ['code', 'var(--skb-graph-6)'],
  ['module', 'var(--skb-graph-structure)'],
];

function Swatch({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: colour }}
    />
  );
}

export function Legend({
  communities,
  hidden,
  onToggle,
  colourBy,
}: {
  communities: readonly Community[];
  hidden: ReadonlySet<number>;
  onToggle(id: number): void;
  colourBy: 'community' | 'type' | 'mastery';
}) {
  const shown = communities.slice(0, MAX_CLUSTERS);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {colourBy === 'mastery' ? (
        <ul aria-label="Mastery" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {MASTERY_STAGES.map((stage) => (
            <li key={stage} className="flex items-center gap-1.5">
              <Swatch colour={`var(--skb-stage-${stage})`} />
              <span aria-hidden="true">{STAGE_GLYPHS[stage]}</span>
              {STAGE_LABELS[stage]}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true">{WEAK_GLYPH}</span> worth studying now
          </li>
          <li className="text-muted">Only concepts are coloured.</li>
        </ul>
      ) : colourBy === 'type' ? (
        <ul aria-label="Node types" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {TYPE_COLOURS.map(([type, colour]) => (
            <li key={type} className="flex items-center gap-1.5">
              <Swatch colour={colour} />
              {NODE_TYPE_PLURALS[type]}
            </li>
          ))}
        </ul>
      ) : (
        <ul aria-label="Clusters" className="flex flex-wrap items-center gap-1">
          {shown.map((community) => {
            const off = hidden.has(community.id);
            return (
              <li key={community.id}>
                <button
                  type="button"
                  aria-pressed={!off}
                  title={off ? 'Show this cluster' : 'Hide this cluster'}
                  className={cn(
                    'flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus',
                    off && 'text-muted line-through',
                  )}
                  onClick={() => onToggle(community.id)}
                >
                  <Swatch colour={communityColour(community.id)} />
                  {community.label}
                  <span className="text-muted">{community.size}</span>
                </button>
              </li>
            );
          })}
          {communities.length > shown.length && (
            <li className="px-1.5 text-muted">and {communities.length - shown.length} smaller</li>
          )}
        </ul>
      )}
      <ul aria-label="Line styles" className="ml-auto flex items-center gap-3 text-muted">
        <li className="flex items-center gap-1.5">
          <EdgeStyleMark confidence="USER" /> stated
        </li>
        <li className="flex items-center gap-1.5">
          <EdgeStyleMark confidence="INFERRED" /> inferred
        </li>
        <li className="flex items-center gap-1.5">
          <EdgeStyleMark confidence="AMBIGUOUS" /> ambiguous
        </li>
      </ul>
    </div>
  );
}
