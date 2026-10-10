import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Badge } from '../../components/Badge';
import { LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { codeEntityQuery } from '../data/api';

/** A piece of code selected in the graph: where it is, what it says about itself, and its concepts. */
export function CodeEntityDetails({ entityId }: { entityId: string }) {
  const api = useApi();
  const entity = useQuery(codeEntityQuery(api, entityId));
  if (entity.isPending) return <LoadingState label="Loading the code" />;
  if (entity.isError || !entity.data) return null;
  const { entity: item, concepts } = entity.data;
  return (
    <section className="space-y-2" aria-label="About this code">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">The code</h3>
      <dl className="grid grid-cols-[5rem_1fr] gap-x-2 gap-y-1 text-sm">
        <dt className="text-muted">Graph</dt>
        <dd>{item.graphName}</dd>
        <dt className="text-muted">Kind</dt>
        <dd>{item.kind}</dd>
        {item.file && (
          <>
            <dt className="text-muted">File</dt>
            <dd className="break-all font-mono text-xs">
              {item.file}
              {item.location && ` · ${item.location}`}
            </dd>
          </>
        )}
      </dl>
      {item.rationale && <p className="text-sm">{item.rationale}</p>}
      <div>
        <p className="text-xs text-muted">Implements</p>
        {concepts.length === 0 ? (
          <p className="text-sm text-muted">No concept yet.</p>
        ) : (
          <ul aria-label="Concepts" className="mt-0.5 space-y-0.5">
            {concepts.map((concept) => (
              <li key={concept.id} className="flex items-center gap-2 text-sm">
                <Link
                  to="/concepts/$conceptId"
                  params={{ conceptId: concept.id }}
                  className="hover:underline"
                >
                  {concept.name}
                </Link>
                {concept.status === 'proposed' && <Badge tone="warning">suggested</Badge>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
