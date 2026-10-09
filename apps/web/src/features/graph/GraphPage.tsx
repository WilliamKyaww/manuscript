import { type GraphFilterInput, type GraphNodeType, NODE_TYPES, type NodeRef } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Page } from '../../components/Page';
import { Pane } from '../../components/Pane';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { formatCount } from '../../lib/format';
import { modulesQuery } from '../learning/api';
import { selectClasses } from '../learning/Field';
import { graphQuery } from './api';
import { GraphView } from './GraphView';
import { Insights } from './Insights';
import { Legend } from './Legend';
import { NodeDetails } from './NodeDetails';
import { NODE_TYPE_PLURALS } from './nodes';

/**
 * The knowledge graph (task 7.08, knowledge-system.md §7.3): every concept, note, source, lecture
 * and module and how they connect, with clusters, filters, search-to-focus and a side panel that
 * shows either the selected node or what the graph suggests studying.
 */

const DEFAULT_TYPES: GraphNodeType[] = ['concept', 'note', 'source', 'lecture', 'module'];

export function GraphPage() {
  const api = useApi();
  const navigate = useNavigate();
  const search = useSearch({ from: '/graph' });
  const modules = useQuery(modulesQuery(api));
  const [types, setTypes] = useState<GraphNodeType[]>(DEFAULT_TYPES);
  const [moduleId, setModuleId] = useState('');
  const [proposed, setProposed] = useState(false);
  const [isolated, setIsolated] = useState(false);
  const [colourBy, setColourBy] = useState<'community' | 'type'>('community');
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const [selected, setSelected] = useState<string | null>(search.focus ?? null);
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(
    search.focus ? { id: search.focus, nonce: 0 } : null,
  );
  const [highlight, setHighlight] = useState<ReadonlySet<string> | null>(null);

  const filter: GraphFilterInput = {
    types,
    ...(moduleId ? { modules: [moduleId] } : {}),
    ...(proposed ? { status: ['accepted', 'proposed'] } : {}),
    ...(isolated ? { isolated: 'true' } : {}),
  };
  const graph = useQuery(graphQuery(api, filter));
  const payload = graph.data;
  const communities = useMemo(
    () => new Map((payload?.communities ?? []).map((community) => [community.id, community])),
    [payload],
  );
  const selectedNode = payload?.nodes.find((node) => node.id === selected) ?? null;

  const show = (id: string) => {
    setSelected(id);
    setFocus((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }));
  };
  const showInGraph = (node: NodeRef) => {
    if (!types.includes(node.type)) setTypes([...types, node.type]);
    show(node.id);
  };

  // Keep the address in step, so a node can be linked to and survives a reload.
  useEffect(() => {
    void navigate({ to: '/graph', search: selected ? { focus: selected } : {}, replace: true });
  }, [selected, navigate]);

  const toggleType = (type: GraphNodeType) =>
    setTypes(types.includes(type) ? types.filter((value) => value !== type) : [...types, type]);

  const toolbar = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3 text-sm">
      <fieldset className="flex flex-wrap items-center gap-3">
        <legend className="sr-only">Show</legend>
        {NODE_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={types.includes(type)}
              onChange={() => toggleType(type)}
            />
            {NODE_TYPE_PLURALS[type]}
          </label>
        ))}
      </fieldset>
      <select
        aria-label="Module"
        className={cn(selectClasses, 'h-8 w-auto')}
        value={moduleId}
        onChange={(event) => setModuleId(event.target.value)}
      >
        <option value="">All modules</option>
        {(modules.data?.modules ?? []).map((module) => (
          <option key={module.id} value={module.id}>
            {module.code} {module.title}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={proposed} onChange={() => setProposed(!proposed)} />
        Proposed relations
      </label>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={isolated} onChange={() => setIsolated(!isolated)} />
        Unlinked notes and sources
      </label>
      <select
        aria-label="Colour by"
        className={cn(selectClasses, 'h-8 w-auto')}
        value={colourBy}
        onChange={(event) => setColourBy(event.target.value as 'community' | 'type')}
      >
        <option value="community">Colour by cluster</option>
        <option value="type">Colour by type</option>
      </select>
    </div>
  );

  return (
    <Page
      title="Graph"
      description="How your concepts, notes and sources connect, and what that suggests studying."
      actions={<FindNode nodes={payload?.nodes ?? []} onFind={show} />}
      toolbar={toolbar}
      layout="panes"
      width="full"
    >
      <Pane
        title="Graph"
        hideTitle
        className="min-w-0 flex-1"
        bodyClassName="overflow-hidden"
        actions={
          payload && (
            <span className="text-xs text-muted">
              {formatCount(payload.nodes.length, 'item')} ·{' '}
              {formatCount(payload.edges.length, 'connection')}
              {payload.truncated &&
                ` (the ${payload.nodes.length} best connected of ${payload.matched})`}
            </span>
          )
        }
        toolbar={
          payload && payload.communities.length > 0 ? (
            <Legend
              communities={payload.communities}
              hidden={hidden}
              onToggle={(id) => {
                const next = new Set(hidden);
                if (!next.delete(id)) next.add(id);
                setHidden(next);
              }}
              colourBy={colourBy}
            />
          ) : undefined
        }
      >
        {graph.isPending ? (
          <LoadingState label="Building the graph" />
        ) : graph.isError ? (
          <ErrorState message="The graph could not be built." onRetry={() => graph.refetch()} />
        ) : graph.data.nodes.length === 0 ? (
          <EmptyState
            title="Nothing to draw yet"
            description="Add concepts and link to them from your notes ([[Paxos]]), or widen the filters above."
          />
        ) : (
          <GraphView
            payload={graph.data}
            colourBy={colourBy}
            hiddenCommunities={hidden}
            selected={selected}
            focus={focus}
            highlight={highlight}
            onSelect={setSelected}
            label={`Knowledge graph: ${formatCount(graph.data.nodes.length, 'item')} and ${formatCount(graph.data.edges.length, 'connection')}. The panel beside it describes the selected item.`}
          />
        )}
      </Pane>
      <Pane
        title={selectedNode ? 'Details' : 'Insights'}
        className="w-80 flex-none border-l border-border"
      >
        {selectedNode && payload ? (
          <NodeDetails
            node={selectedNode}
            payload={payload}
            communities={communities}
            onSelect={show}
            onFocus={(id) => setFocus((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }))}
            onHighlight={setHighlight}
            onClose={() => setSelected(null)}
          />
        ) : (
          <Insights moduleId={moduleId || null} onShowInGraph={showInGraph} />
        )}
      </Pane>
    </Page>
  );
}

/** Search-to-focus: type a name, and the graph centres on it. */
function FindNode({
  nodes,
  onFind,
}: {
  nodes: readonly { id: string; label: string }[];
  onFind(id: string): void;
}) {
  const listId = useId();
  const [text, setText] = useState('');
  const [missing, setMissing] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const wanted = text.trim().toLowerCase();
    const match =
      nodes.find((node) => node.label.toLowerCase() === wanted) ??
      nodes.find((node) => node.label.toLowerCase().startsWith(wanted)) ??
      nodes.find((node) => node.label.toLowerCase().includes(wanted));
    setMissing(!match);
    if (match) onFind(match.id);
  };
  return (
    <form className="flex items-center gap-2" onSubmit={submit}>
      <Input
        aria-label="Find in graph"
        placeholder="Find in graph"
        list={listId}
        className="w-56"
        value={text}
        aria-invalid={missing || undefined}
        onChange={(event) => {
          setText(event.target.value);
          setMissing(false);
        }}
      />
      <datalist id={listId}>
        {nodes.slice(0, 1_000).map((node) => (
          <option key={node.id} value={node.label} />
        ))}
      </datalist>
      <Button type="submit" size="sm" disabled={!text.trim()}>
        <Search aria-hidden="true" size={14} />
        Find
      </Button>
      {missing && (
        <span role="status" className="text-xs text-danger">
          Not in the graph
        </span>
      )}
    </form>
  );
}
