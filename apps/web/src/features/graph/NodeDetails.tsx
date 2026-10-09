import type { Community, GraphNode, GraphPayload } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Crosshair, ExternalLink, X } from 'lucide-react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Input } from '../../components/Input';
import { LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { graphPathQuery } from './api';
import { neighboursOf } from './neighbours';
import {
  confidenceLabel,
  EdgeStyleMark,
  hasPage,
  NODE_TYPE_LABELS,
  relationPhrase,
  useOpenNode,
} from './nodes';

/** The selected node beside the graph: what it is, what it connects to, and paths from it. */

export function NodeDetails({
  node,
  payload,
  communities,
  onSelect,
  onFocus,
  onHighlight,
  onClose,
}: {
  node: GraphNode;
  payload: GraphPayload;
  communities: ReadonlyMap<number, Community>;
  onSelect(id: string): void;
  onFocus(id: string): void;
  onHighlight(nodes: ReadonlySet<string> | null): void;
  onClose(): void;
}) {
  const open = useOpenNode();
  const groups = neighboursOf(node.id, payload);
  const community = node.community === null ? undefined : communities.get(node.community);
  return (
    <div className="space-y-4 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words text-base font-semibold">{node.label}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {[NODE_TYPE_LABELS[node.type], ...node.modules].join(' · ')}
            {community && ` · cluster “${community.label}”`}
          </p>
        </div>
        <IconButton label="Close details" icon={<X size={14} />} size="sm" onClick={onClose} />
      </div>
      <div className="flex flex-wrap gap-2">
        {hasPage(node.type) && (
          <Button size="sm" variant="primary" onClick={() => open(node)}>
            <ExternalLink aria-hidden="true" size={14} />
            Open
          </Button>
        )}
        <Button size="sm" onClick={() => onFocus(node.id)}>
          <Crosshair aria-hidden="true" size={14} />
          Centre
        </Button>
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Connections</h3>
        {groups.size === 0 ? (
          <p className="text-sm text-muted">No connections among what is shown.</p>
        ) : (
          [...groups].map(([phrase, neighbours]) => (
            <div key={phrase}>
              <p className="text-xs text-muted">{phrase}</p>
              <ul aria-label={phrase} className="mt-0.5 space-y-0.5">
                {neighbours.map(({ node: other, edge }) => (
                  <li key={edge.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
                      onClick={() => onSelect(other.id)}
                    >
                      <EdgeStyleMark confidence={edge.confidence} />
                      <span className="min-w-0 flex-1 truncate">{other.label}</span>
                      {edge.status === 'proposed' && <Badge tone="warning">proposed</Badge>}
                      {(edge.confidence === 'INFERRED' || edge.confidence === 'AMBIGUOUS') && (
                        <span className="shrink-0 text-xs text-muted">
                          {confidenceLabel(edge.confidence)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <PathFinder
        key={node.id}
        from={node}
        payload={payload}
        onSelect={onSelect}
        onHighlight={onHighlight}
      />
    </div>
  );
}

/** "How does this relate to …?": the shortest path that does not go through the course structure. */
function PathFinder({
  from,
  payload,
  onSelect,
  onHighlight,
}: {
  from: GraphNode;
  payload: GraphPayload;
  onSelect(id: string): void;
  onHighlight(nodes: ReadonlySet<string> | null): void;
}) {
  const api = useApi();
  const listId = useId();
  const [text, setText] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const path = useQuery({
    ...graphPathQuery(api, from.id, target ?? ''),
    enabled: target !== null,
  });

  // The path is drawn only while this finder is shown (a new selection mounts a new one).
  useEffect(() => () => onHighlight(null), [onHighlight]);

  useEffect(() => {
    if (path.data?.found) onHighlight(new Set(path.data.nodes.map((node) => node.id)));
  }, [path.data, onHighlight]);

  const candidates = payload.nodes.filter((node) => node.id !== from.id);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const wanted = text.trim().toLowerCase();
    const match =
      candidates.find((node) => node.label.toLowerCase() === wanted) ??
      candidates.find((node) => node.label.toLowerCase().includes(wanted));
    setTarget(match?.id ?? null);
    if (!match) onHighlight(null);
  };

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
        How does it relate to…
      </h3>
      <form className="flex gap-2" onSubmit={submit}>
        <Input
          aria-label="Find a path to"
          placeholder="Another concept or note"
          list={listId}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <datalist id={listId}>
          {candidates.slice(0, 500).map((node) => (
            <option key={node.id} value={node.label} />
          ))}
        </datalist>
        <Button type="submit" size="sm" disabled={!text.trim()}>
          Find
        </Button>
      </form>
      {target !== null && path.isPending && <LoadingState label="Finding a path" />}
      {path.data && !path.data.found && (
        <p className="text-sm text-muted">
          No path without going through a module, lecture or topic: they are not connected yet.
        </p>
      )}
      {path.data?.found && (
        <ol aria-label="Path" className="space-y-1 text-sm">
          {path.data.nodes.map((node, index) => {
            const edge = path.data.edges[index - 1];
            return (
              <li key={node.id}>
                {edge && (
                  <p className="pl-1.5 text-xs text-muted">
                    {relationPhrase(edge.relation, edge.source === path.data.nodes[index - 1]?.id)}
                  </p>
                )}
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-left hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
                  onClick={() => onSelect(node.id)}
                >
                  {node.label}
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
