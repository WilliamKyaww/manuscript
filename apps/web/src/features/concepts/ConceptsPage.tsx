import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Lightbulb, Plus, Search } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Page } from '../../components/Page';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { modulesQuery } from '../learning/api';
import { conceptsQuery } from './api';
import { ConceptDialog } from './ConceptDialog';

/** Every concept, filterable by name, alias or module (task 6.13). */
export function ConceptsPage() {
  const api = useApi();
  const concepts = useQuery(conceptsQuery(api));
  const modules = useQuery(modulesQuery(api));
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const filterId = useId();
  const codes = useMemo(
    () => new Map((modules.data?.modules ?? []).map((module) => [module.id, module.code])),
    [modules.data],
  );
  const needle = filter.trim().toLowerCase();
  const all = concepts.data?.concepts ?? [];
  const shown = needle
    ? all.filter((concept) =>
        [
          concept.name,
          ...concept.aliases,
          ...concept.moduleIds.map((id) => codes.get(id) ?? ''),
        ].some((text) => text.toLowerCase().includes(needle)),
      )
    : all;

  return (
    <Page
      title="Concepts"
      description="The ideas you are learning. [[Name]] in a note links to a concept when no note has that name."
      actions={
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" size={16} />
          New concept
        </Button>
      }
      toolbar={
        <div className="relative w-full max-w-xs pb-3">
          <Search
            aria-hidden="true"
            size={14}
            className="pointer-events-none absolute top-2 left-2.5 text-muted"
          />
          <label htmlFor={filterId} className="sr-only">
            Filter concepts
          </label>
          <input
            id={filterId}
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by name, alias or module"
            className="h-8 w-full rounded-md border border-border-strong bg-surface pr-2 pl-8 text-sm text-text placeholder:text-subtle"
          />
        </div>
      }
    >
      {concepts.isPending && <LoadingState label="Loading concepts" />}
      {concepts.isError && (
        <ErrorState message={concepts.error.message} onRetry={() => void concepts.refetch()} />
      )}
      {concepts.isSuccess && all.length === 0 && (
        <EmptyState
          icon={<Lightbulb size={20} />}
          title="No concepts yet"
          description="Add the ideas each module teaches — Paxos, the CAP theorem, back-propagation. Later, cards, questions and mastery attach to them. Selecting an unresolved [[link]] in a note also offers to create one."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" size={16} />
              New concept
            </Button>
          }
        />
      )}
      {all.length > 0 && shown.length === 0 && (
        <p className="text-sm text-muted">No concept matches “{filter}”.</p>
      )}
      {shown.length > 0 && (
        <ul
          aria-label="Concepts"
          className="divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {shown.map((concept) => (
            <li key={concept.id}>
              <Link
                to="/concepts/$conceptId"
                params={{ conceptId: concept.id }}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
              >
                <Lightbulb aria-hidden="true" size={15} className="shrink-0 text-muted" />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{concept.name}</span>
                  {concept.aliases.length > 0 && (
                    <span className="block truncate text-xs text-muted">
                      also {concept.aliases.join(', ')}
                    </span>
                  )}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  {concept.moduleIds.map((id) => (
                    <Badge key={id}>{codes.get(id) ?? '?'}</Badge>
                  ))}
                  <span className="w-24 text-right text-xs text-subtle">
                    {concept.mentionCount} {concept.mentionCount === 1 ? 'note' : 'notes'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <ConceptDialog onClose={() => setCreating(false)} />}
    </Page>
  );
}
