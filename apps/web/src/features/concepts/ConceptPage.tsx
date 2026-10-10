import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { FileText, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button, buttonClasses } from '../../components/Button';
import { Card } from '../../components/Card';
import { Dialog } from '../../components/Dialog';
import { Highlighted } from '../../components/Highlighted';
import { Page, StickySection } from '../../components/Page';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { ApiError } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';
import { notifyError } from '../../lib/notify';
import { ConceptCodeSection } from '../code/ConceptCodeSection';
import { LocalGraph } from '../graph/LocalGraph';
import { RelationsSection } from '../graph/RelationsSection';
import { viewerSearchFor } from '../library/links';
import { MarkdownPreview } from '../notes/preview/MarkdownPreview';
import { useLinkResolve } from '../notes/preview/useLinkResolve';
import { ConceptMasteryPanel } from '../progress/ConceptMasteryPanel';
import { conceptQuery, useConceptActions } from './api';
import { ConceptDialog } from './ConceptDialog';

const IMPORTANCE: Record<string, string> = {
  '0.5': 'Minor',
  '1': 'Normal',
  '1.5': 'Important',
  '2': 'Core',
};

/** One concept: summary, memberships, the notes that link to it and source passages (task 6.13). */
export function ConceptPage() {
  const api = useApi();
  const navigate = useNavigate();
  const { conceptId } = useParams({ strict: false }) as { conceptId: string };
  const concept = useQuery(conceptQuery(api, conceptId));
  const actions = useConceptActions();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const resolve = useLinkResolve();

  if (concept.isPending) {
    return (
      <Page title="Concept" breadcrumbs={[{ label: 'Concepts', to: '/concepts' }]}>
        <LoadingState label="Loading the concept" />
      </Page>
    );
  }
  if (concept.isError) {
    const missing = concept.error instanceof ApiError && concept.error.status === 404;
    return (
      <Page title="Concept" breadcrumbs={[{ label: 'Concepts', to: '/concepts' }]}>
        {missing ? (
          <EmptyState
            title="This concept does not exist"
            description="It may have been deleted."
            action={
              <Link to="/concepts" className={buttonClasses()}>
                Back to concepts
              </Link>
            }
          />
        ) : (
          <ErrorState message={concept.error.message} onRetry={() => void concept.refetch()} />
        )}
      </Page>
    );
  }

  const data = concept.data;
  return (
    <Page
      title={data.name}
      description={data.aliases.length > 0 ? `Also called ${data.aliases.join(', ')}` : undefined}
      breadcrumbs={[{ label: 'Concepts', to: '/concepts' }, { label: data.name }]}
      actions={
        <>
          <Button onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" size={16} />
            Edit
          </Button>
          <Button variant="danger" onClick={() => setDeleting(true)}>
            <Trash2 aria-hidden="true" size={16} />
            Delete
          </Button>
        </>
      }
    >
      <Card className="mb-8 p-4">
        {data.summary ? (
          <MarkdownPreview content={data.summary} resolve={resolve} noteId={data.id} />
        ) : (
          <p className="text-sm text-muted">No summary yet — Edit to add one or two sentences.</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <Badge>{IMPORTANCE[String(data.importance)] ?? `Importance ${data.importance}`}</Badge>
          {data.modules.map((module) => (
            <Link
              key={module.id}
              to="/modules/$moduleId"
              params={{ moduleId: module.id }}
              className="hover:underline"
            >
              <Badge tone="info">{module.code}</Badge>
            </Link>
          ))}
          {data.topics.map((topic) => (
            <Badge key={topic.id}>{topic.title}</Badge>
          ))}
          {data.note && (
            <Link
              to="/notes/$noteId"
              params={{ noteId: data.note.id }}
              className="inline-flex items-center gap-1 hover:underline"
            >
              <FileText aria-hidden="true" size={14} />
              {data.note.title}
            </Link>
          )}
        </div>
      </Card>

      <ConceptMasteryPanel conceptId={data.id} />

      <RelationsSection conceptId={data.id} />

      <ConceptCodeSection conceptId={data.id} />

      <StickySection
        title="Connections"
        description="Everything one or two steps away: relations, notes, sources and the course."
      >
        <LocalGraph node={data.id} />
      </StickySection>

      <StickySection
        title="Notes linking here"
        description={`${data.mentionCount} ${data.mentionCount === 1 ? 'note' : 'notes'}`}
      >
        {data.mentions.length === 0 ? (
          <p className="text-sm text-muted">No note links to [[{data.name}]] yet.</p>
        ) : (
          <ul aria-label="Notes linking here" className="space-y-2">
            {data.mentions.map((mention) => (
              <li key={mention.note.id} className="rounded-lg border border-border bg-surface p-3">
                <Link
                  to="/notes/$noteId"
                  params={{ noteId: mention.note.id }}
                  className="font-medium hover:underline"
                >
                  {mention.note.title}
                </Link>
                <ul className="mt-1 space-y-0.5">
                  {mention.lines.map((line) => (
                    <li key={line.line}>
                      <Link
                        to="/notes/$noteId"
                        params={{ noteId: mention.note.id }}
                        search={{ line: line.line }}
                        className="block truncate text-sm text-muted hover:text-text"
                      >
                        {line.context}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </StickySection>

      <StickySection
        title="In your sources"
        description="Passages that name the concept or one of its aliases."
      >
        {data.passages.length === 0 ? (
          <p className="text-sm text-muted">No source in the library mentions it by name.</p>
        ) : (
          <ul aria-label="Source passages" className="space-y-2">
            {data.passages.map((passage) => (
              <li key={`${passage.source.id}:${passage.section.ordinal}`}>
                <Link
                  to="/library/$sourceId"
                  params={{ sourceId: passage.source.id }}
                  search={viewerSearchFor(passage.locator, passage.section.ordinal)}
                  className="block rounded-lg border border-border bg-surface p-3 hover:bg-surface-hover"
                >
                  <span className="text-sm font-medium">
                    {passage.source.title} › {passage.section.label}
                  </span>
                  <Highlighted
                    parts={passage.snippet}
                    className="mt-1 line-clamp-2 block text-sm text-muted"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </StickySection>

      {editing && <ConceptDialog concept={data} onClose={() => setEditing(false)} />}
      <Dialog
        open={deleting}
        onOpenChange={(open) => !open && setDeleting(false)}
        title={`Delete “${data.name}”?`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setDeleting(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={actions.remove.isPending}
              onClick={() =>
                actions.remove.mutate(data.id, {
                  onSuccess: () => void navigate({ to: '/concepts' }),
                  onError: notifyError,
                })
              }
            >
              Delete concept
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Links to it in notes become unresolved again; the notes themselves do not change.
        </p>
      </Dialog>
    </Page>
  );
}
