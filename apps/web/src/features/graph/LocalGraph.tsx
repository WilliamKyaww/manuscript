import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Network } from 'lucide-react';
import { useState } from 'react';
import { buttonClasses } from '../../components/Button';
import { ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { localGraphQuery } from './api';
import { GraphView } from './GraphView';
import { neighboursOf } from './neighbours';
import { EdgeStyleMark, hasPage, useOpenNode } from './nodes';

/**
 * A node's neighbourhood (task 7.09), on note and concept pages: a small graph one or two steps
 * deep, and the direct connections as a list (which is also how the graph reads without sight).
 */

const NO_COMMUNITIES = new Set<number>();

export function LocalGraph({ node, height = 280 }: { node: string; height?: number }) {
  const api = useApi();
  const open = useOpenNode();
  const [depth, setDepth] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<string | null>(null);
  const local = useQuery(localGraphQuery(api, node, depth));

  if (local.isPending) return <LoadingState label="Loading connections" />;
  if (local.isError)
    return (
      <ErrorState message="The connections could not be loaded." onRetry={() => local.refetch()} />
    );
  const payload = local.data;
  const groups = neighboursOf(node, payload);
  const centre = payload.nodes.find((candidate) => candidate.id === node);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <fieldset className="flex gap-1">
          <legend className="sr-only">Depth</legend>
          {([1, 2] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={depth === value}
              className={cn(
                buttonClasses('secondary', 'sm'),
                depth === value && 'bg-accent-subtle text-text',
              )}
              onClick={() => setDepth(value)}
            >
              {value === 1 ? '1 step' : '2 steps'}
            </button>
          ))}
        </fieldset>
        <Link to="/graph" search={{ focus: node }} className={buttonClasses('secondary', 'sm')}>
          <Network aria-hidden="true" size={14} />
          Open in graph
        </Link>
      </div>
      {payload.edges.length > 0 && (
        <div
          className="overflow-hidden rounded-lg border border-border bg-surface"
          style={{ height }}
        >
          <GraphView
            payload={payload}
            colourBy="community"
            hiddenCommunities={NO_COMMUNITIES}
            selected={selected ?? node}
            focus={null}
            highlight={null}
            onSelect={(id) => {
              setSelected(id);
              const target = payload.nodes.find((candidate) => candidate.id === id);
              if (target && id !== node && hasPage(target.type)) open(target);
            }}
            compact
            label={`Connections of ${centre?.label ?? 'this item'}: ${payload.nodes.length - 1} nearby. They are listed below.`}
          />
        </div>
      )}
      {groups.size === 0 ? (
        <p className="text-sm text-muted">
          Nothing is connected yet. Link to it from a note, or relate it to other concepts.
        </p>
      ) : (
        <div className="space-y-2">
          {[...groups].map(([phrase, neighbours]) => (
            <div key={phrase}>
              <p className="text-xs text-muted">{phrase}</p>
              <ul aria-label={phrase} className="mt-0.5 space-y-0.5">
                {neighbours.map(({ node: other, edge }) => (
                  <li key={edge.id} className="flex items-center gap-2 text-sm">
                    <EdgeStyleMark confidence={edge.confidence} />
                    {hasPage(other.type) ? (
                      <button
                        type="button"
                        className="truncate text-left hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                        onClick={() => open(other)}
                      >
                        {other.label}
                      </button>
                    ) : (
                      <span className="truncate">{other.label}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
