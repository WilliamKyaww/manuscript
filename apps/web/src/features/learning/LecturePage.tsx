import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Lightbulb, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, buttonClasses } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Page, StickySection } from '../../components/Page';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { ApiError } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';
import { notifyError, notifySuccess } from '../../lib/notify';
import { GenerateDialog } from '../inbox/GenerateDialog';
import { PipelineSection } from '../pipeline/PipelineSection';
import { lectureQuery, useLearningActions } from './api';
import { LectureDialog } from './dialogs';
import { LectureNotes, LectureSources } from './LectureSections';

/** One lecture with its sources, notes and concepts (task 6.12). */
export function LecturePage() {
  const api = useApi();
  const navigate = useNavigate();
  const { lectureId } = useParams({ strict: false }) as { lectureId: string };
  const lecture = useQuery(lectureQuery(api, lectureId));
  const actions = useLearningActions();
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (lecture.isPending) {
    return (
      <Page title="Lecture" breadcrumbs={[{ label: 'Modules', to: '/modules' }]}>
        <LoadingState label="Loading the lecture" />
      </Page>
    );
  }
  if (lecture.isError) {
    const missing = lecture.error instanceof ApiError && lecture.error.status === 404;
    return (
      <Page title="Lecture" breadcrumbs={[{ label: 'Modules', to: '/modules' }]}>
        {missing ? (
          <EmptyState
            title="This lecture does not exist"
            description="It may have been deleted with its module."
            action={
              <Link to="/modules" className={buttonClasses()}>
                Back to modules
              </Link>
            }
          />
        ) : (
          <ErrorState message={lecture.error.message} onRetry={() => void lecture.refetch()} />
        )}
      </Page>
    );
  }

  const data = lecture.data;
  const facts = [
    data.kind[0]?.toUpperCase() + data.kind.slice(1),
    data.week !== null ? `week ${data.week}` : null,
    data.heldOn,
  ].filter(Boolean);
  return (
    <Page
      title={`${data.key} ${data.title}`}
      description={facts.join(' · ')}
      breadcrumbs={[
        { label: 'Modules', to: '/modules' },
        { label: data.module.code, to: `/modules/${data.module.id}` },
        { label: data.key },
      ]}
      actions={
        <>
          <Button onClick={() => setGenerating(true)}>
            <Sparkles aria-hidden="true" size={16} />
            Generate…
          </Button>
          <Button onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" size={16} />
            Edit
          </Button>
          <Button variant="danger-outline" onClick={() => setDeleting(true)}>
            <Trash2 aria-hidden="true" size={16} />
            Delete
          </Button>
        </>
      }
    >
      <LectureSources lecture={data} />
      <PipelineSection lectureId={data.id} hasSources={data.sources.length > 0} />
      <LectureNotes lecture={data} />
      <StickySection title="Concepts" description="Concepts linked from this lecture's notes.">
        {data.concepts.length === 0 ? (
          <p className="text-sm text-muted">
            None yet: link concepts from the notes with [[Concept name]].
          </p>
        ) : (
          <ul aria-label="Lecture concepts" className="flex flex-wrap gap-2">
            {data.concepts.map((concept) => (
              <li key={concept.id}>
                <Link
                  to="/concepts/$conceptId"
                  params={{ conceptId: concept.id }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm hover:bg-surface-hover"
                >
                  <Lightbulb aria-hidden="true" size={13} className="text-muted" />
                  {concept.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </StickySection>
      {editing && (
        <LectureDialog
          open
          moduleId={data.moduleId}
          lecture={data}
          onClose={() => setEditing(false)}
        />
      )}
      {generating && (
        <GenerateDialog
          scope={{ kind: 'lecture', lectureId: data.id }}
          title={`${data.key} — ${data.title}`}
          onClose={() => setGenerating(false)}
        />
      )}
      <ConfirmDialog
        open={deleting}
        title={`Delete ${data.key}?`}
        confirmLabel="Delete lecture"
        busy={actions.deleteLecture.isPending}
        onCancel={() => setDeleting(false)}
        onConfirm={() =>
          actions.deleteLecture.mutate(data.id, {
            onSuccess: () => {
              notifySuccess(`${data.key} deleted`);
              void navigate({ to: '/modules/$moduleId', params: { moduleId: data.module.id } });
            },
            onError: notifyError,
          })
        }
      >
        <p>
          The lecture leaves {data.module.code}. Its notes and sources stay in the vault and the
          library, and concepts are kept.
        </p>
      </ConfirmDialog>
    </Page>
  );
}
