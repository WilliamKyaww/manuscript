import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, buttonClasses } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Dialog } from '../../../components/Dialog';
import { Page } from '../../../components/Page';
import { EmptyState, ErrorState, LoadingState } from '../../../components/States';
import { ApiError } from '../../../lib/api/client';
import { useApi } from '../../../lib/api/context';
import { notifyError, notifySuccess } from '../../../lib/notify';
import { ModuleReadiness } from '../../progress/ModuleReadiness';
import { coursesQuery, moduleQuery, useLearningActions } from '../api';
import { ModuleDialog } from '../dialogs';
import { MarksSummary } from '../MarksSummary';
import { AssessmentsSection } from './AssessmentsSection';
import { LecturesSection } from './LecturesSection';
import { MaterialSections } from './MaterialSections';
import { TopicsSection } from './TopicsSection';

/** One module: marks and calculator, assessments, lectures, topics and material (task 6.11). */
export function ModulePage() {
  const api = useApi();
  const navigate = useNavigate();
  const { moduleId } = useParams({ strict: false }) as { moduleId: string };
  const module = useQuery(moduleQuery(api, moduleId));
  const courses = useQuery(coursesQuery(api));
  const actions = useLearningActions();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (module.isPending) {
    return (
      <Page title="Module" breadcrumbs={[{ label: 'Modules', to: '/modules' }]}>
        <LoadingState label="Loading the module" />
      </Page>
    );
  }
  if (module.isError) {
    const missing = module.error instanceof ApiError && module.error.status === 404;
    return (
      <Page title="Module" breadcrumbs={[{ label: 'Modules', to: '/modules' }]}>
        {missing ? (
          <EmptyState
            title="This module does not exist"
            description="It may have been deleted."
            action={
              <Link to="/modules" className={buttonClasses()}>
                Back to modules
              </Link>
            }
          />
        ) : (
          <ErrorState message={module.error.message} onRetry={() => void module.refetch()} />
        )}
      </Page>
    );
  }

  const data = module.data;
  const course = courses.data?.courses.find((item) => item.id === data.courseId);
  const facts = [
    data.credits !== null ? `${data.credits} credits` : null,
    data.semester ? `Semester ${data.semester}` : null,
    course?.title,
    data.archived ? 'Archived' : null,
  ].filter(Boolean);

  return (
    <Page
      title={`${data.code} ${data.title}`}
      description={facts.join(' · ') || undefined}
      breadcrumbs={[{ label: 'Modules', to: '/modules' }, { label: data.code }]}
      width="wide"
      actions={
        <>
          <Button onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" size={16} />
            Edit
          </Button>
          <Button
            onClick={() =>
              actions.updateModule.mutate(
                { id: data.id, archived: !data.archived },
                { onError: notifyError },
              )
            }
          >
            {data.archived ? (
              <ArchiveRestore aria-hidden="true" size={16} />
            ) : (
              <Archive aria-hidden="true" size={16} />
            )}
            {data.archived ? 'Restore' : 'Archive'}
          </Button>
          <Button variant="danger-outline" onClick={() => setDeleting(true)}>
            <Trash2 aria-hidden="true" size={16} />
            Delete
          </Button>
        </>
      }
    >
      <Card className="mb-8 p-4">
        <h2 className="mb-3 text-sm font-semibold">
          Module mark{data.targetMark !== null ? ` · target ${data.targetMark} %` : ''}
        </h2>
        <MarksSummary marks={data.marks} requirement={data.requirement} target={data.targetMark} />
        {data.targetMark === null && (
          <p className="mt-2 text-xs text-muted">
            Set a target mark (Edit) to see what the remaining work must average.
          </p>
        )}
      </Card>
      <ModuleReadiness moduleId={data.id} />
      <AssessmentsSection moduleId={data.id} assessments={data.assessments} />
      <LecturesSection moduleId={data.id} lectures={data.lectures} />
      <TopicsSection moduleId={data.id} topics={data.topics} />
      <MaterialSections module={data} />

      {editing && (
        <ModuleDialog
          open
          module={data}
          courses={courses.data?.courses ?? []}
          onClose={() => setEditing(false)}
        />
      )}
      <Dialog
        open={deleting}
        onOpenChange={(open) => !open && setDeleting(false)}
        title={`Delete ${data.code}?`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setDeleting(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={actions.deleteModule.isPending}
              onClick={() =>
                actions.deleteModule.mutate(data.id, {
                  onSuccess: () => {
                    notifySuccess(`${data.code} deleted`);
                    void navigate({ to: '/modules' });
                  },
                  onError: notifyError,
                })
              }
            >
              Delete module
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Its lectures, topics and assessments are deleted. Notes and files in{' '}
          <code>Sources/{data.code}/</code> stay where they are, and concepts are kept.
        </p>
      </Dialog>
    </Page>
  );
}
