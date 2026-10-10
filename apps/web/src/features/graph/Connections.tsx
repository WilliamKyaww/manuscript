import type { GraphNode, NodeRef } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { connectionsQuery } from './api';

/**
 * Connections across modules (task 15.05): the concepts that turn up in more than one module and the
 * stated relations that cross from one module to another — where one course meets another. Shown
 * beside the graph in place of the insights.
 */

const ref = (node: GraphNode): NodeRef => ({ id: node.id, type: node.type, label: node.label });

export function Connections({ onShowInGraph }: { onShowInGraph(node: NodeRef): void }) {
  const api = useApi();
  const connections = useQuery(connectionsQuery(api));
  if (connections.isPending) return <LoadingState label="Finding connections" />;
  if (connections.isError)
    return (
      <ErrorState
        message="The connections could not be found."
        onRetry={() => connections.refetch()}
      />
    );
  const { shared, links } = connections.data;
  if (shared.length === 0 && links.length === 0)
    return (
      <EmptyState
        icon={<ArrowLeftRight size={22} />}
        title="No connections between modules yet"
        description={
          <p>
            Put a concept in two modules, or relate concepts from different modules on a concept’s
            page, and the links between your courses appear here.
          </p>
        }
      />
    );
  return (
    <div className="space-y-5 p-3 text-sm">
      <section aria-label="Concepts in more than one module">
        <h3 className="mb-2 font-semibold">In more than one module</h3>
        {shared.length === 0 ? (
          <p className="text-muted">No concept belongs to two modules yet.</p>
        ) : (
          <ul className="space-y-2">
            {shared.map((entry) => (
              <li key={entry.node.id} className="rounded-md border border-border p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">{entry.node.label}</span>
                  <Button size="sm" variant="ghost" onClick={() => onShowInGraph(ref(entry.node))}>
                    Show
                  </Button>
                </div>
                <p className="mt-1 flex flex-wrap gap-1">
                  {entry.modules.map((code) => (
                    <Badge key={code}>{code}</Badge>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Relations between modules">
        <h3 className="mb-2 font-semibold">Between modules</h3>
        {links.length === 0 ? (
          <p className="text-muted">No relation yet joins concepts of different modules.</p>
        ) : (
          <ul className="space-y-2">
            {links.map((link) => (
              <li key={link.edge.id} className="rounded-md border border-border p-2">
                <p>{link.why}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <Badge tone={link.edge.confidence === 'USER' ? 'success' : 'warning'}>
                    {link.edge.confidence === 'USER'
                      ? 'Stated'
                      : link.edge.confidence === 'EXTRACTED'
                        ? 'In the material'
                        : link.edge.confidence === 'INFERRED'
                          ? 'Inferred'
                          : 'Unsure'}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => onShowInGraph(ref(link.source))}>
                    Show {link.source.label}
                  </Button>
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
