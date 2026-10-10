import type { GraphReport, NodeRef, StudyPrompt } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Badge, type BadgeTone } from '../../components/Badge';
import { Button } from '../../components/Button';
import { ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { graphReportQuery } from './api';
import { useOpenNode } from './nodes';

/**
 * What the graph says about the course (tasks 7.04–7.06): study prompts that lead somewhere, the
 * core concepts and the gaps. Shown beside the graph when nothing is selected.
 */

const PROMPT_KINDS: Record<StudyPrompt['kind'], { label: string; tone: BadgeTone }> = {
  verify: { label: 'Check', tone: 'warning' },
  gap: { label: 'Gap', tone: 'danger' },
  bridge: { label: 'Bridge', tone: 'info' },
  surprising: { label: 'Connection', tone: 'success' },
  cohesion: { label: 'Cluster', tone: 'neutral' },
};

export function PromptCard({
  prompt,
  onShowInGraph,
}: {
  prompt: StudyPrompt;
  onShowInGraph?: (node: NodeRef) => void;
}) {
  const open = useOpenNode();
  const kind = PROMPT_KINDS[prompt.kind];
  return (
    <li className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-1 flex items-start gap-2">
        <Badge tone={kind.tone}>{kind.label}</Badge>
        <p className="min-w-0 text-sm font-medium">{prompt.title}</p>
      </div>
      <p className="text-xs text-muted">{prompt.detail}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {prompt.actions.map((action) => {
          if (action.view === 'graph' && !onShowInGraph) return null;
          return (
            <Button
              key={`${action.view}:${action.node.id}`}
              size="sm"
              onClick={() =>
                action.view === 'graph'
                  ? onShowInGraph?.(action.node)
                  : open(action.node, action.view === 'relations' ? 'relations' : undefined)
              }
            >
              {action.label}
            </Button>
          );
        })}
      </div>
    </li>
  );
}

function NodeList({
  title,
  nodes,
  onSelect,
  empty,
}: {
  title: string;
  nodes: { node: NodeRef; detail?: string }[];
  onSelect(node: NodeRef): void;
  empty: string;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="eyebrow">{title}</h3>
      {nodes.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul aria-label={title} className="space-y-0.5">
          {nodes.map(({ node, detail }) => (
            <li key={node.id}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
                onClick={() => onSelect(node)}
              >
                <span className="truncate">{node.label}</span>
                {detail && <span className="shrink-0 text-xs text-muted">{detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Insights({
  moduleId,
  onShowInGraph,
}: {
  moduleId: string | null;
  onShowInGraph(node: NodeRef): void;
}) {
  const api = useApi();
  const report = useQuery(graphReportQuery(api, moduleId));
  if (report.isPending) return <LoadingState label="Reading the graph" />;
  if (report.isError)
    return (
      <ErrorState message="The graph could not be analysed." onRetry={() => report.refetch()} />
    );
  const data: GraphReport = report.data;
  return (
    <div className="space-y-5 p-3">
      <section className="space-y-2">
        <h3 className="eyebrow">Study prompts</h3>
        {data.prompts.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing stands out yet. Prompts appear as concepts, links and relations grow.
          </p>
        ) : (
          <ul aria-label="Study prompts" className="space-y-2">
            {data.prompts.map((prompt) => (
              <PromptCard key={prompt.id} prompt={prompt} onShowInGraph={onShowInGraph} />
            ))}
          </ul>
        )}
      </section>
      <NodeList
        title="Core concepts"
        nodes={data.coreConcepts.map(({ node, degree }) => ({
          node,
          detail: `${degree} ${degree === 1 ? 'connection' : 'connections'}`,
        }))}
        onSelect={onShowInGraph}
        empty="No concept is connected yet."
      />
      <NodeList
        title="Gaps"
        nodes={data.isolated.map((node) => ({ node }))}
        onSelect={onShowInGraph}
        empty="Every concept has at least two connections."
      />
    </div>
  );
}
