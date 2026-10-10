import type { LectureDetail } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { FilePlus, Lightbulb, Pencil, Sparkles, Trash2, Unlink } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, buttonClasses } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Input } from '../../components/Input';
import { Page, StickySection } from '../../components/Page';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { ApiError } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { notifyError } from '../../lib/notify';
import { GenerateDialog } from '../inbox/GenerateDialog';
import { sourcesQuery } from '../library/api';
import { SourceIcon } from '../library/SourceRow';
import { templatesQuery, treeQuery, useCreateNote } from '../notes/api';
import { PipelineSection } from '../pipeline/PipelineSection';
import { lectureQuery, useLearningActions } from './api';
import { LectureDialog } from './dialogs';
import { selectClasses } from './Field';
import { moduleFolder } from './module/MaterialSections';

/** One lecture with its sources, notes and concepts (task 6.12). */
export function LecturePage() {
  const api = useApi();
  const navigate = useNavigate();
  const { lectureId } = useParams({ strict: false }) as { lectureId: string };
  const lecture = useQuery(lectureQuery(api, lectureId));
  const actions = useLearningActions();
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);

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
          <Button
            variant="danger"
            onClick={() =>
              actions.deleteLecture.mutate(data.id, {
                onSuccess: () =>
                  void navigate({ to: '/modules/$moduleId', params: { moduleId: data.module.id } }),
                onError: notifyError,
              })
            }
          >
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
    </Page>
  );
}

const rowClasses = 'flex items-center gap-2 px-3 py-1.5 text-sm';

function LectureSources({ lecture }: { lecture: LectureDetail }) {
  const api = useApi();
  const sources = useQuery(sourcesQuery(api));
  const actions = useLearningActions();
  const [choice, setChoice] = useState('');
  const attached = new Set(lecture.sources.map((source) => source.id));
  const candidates = (sources.data?.sources ?? [])
    .filter((source) => !attached.has(source.id))
    // The module's own material first.
    .sort(
      (a, b) =>
        Number(b.moduleCode === lecture.module.code) - Number(a.moduleCode === lecture.module.code),
    );
  return (
    <StickySection title="Sources" description="Slides, handouts and readings for this lecture.">
      {lecture.sources.length > 0 && (
        <ul
          aria-label="Lecture sources"
          className="mb-3 divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {lecture.sources.map((source) => (
            <li key={source.id} className={rowClasses}>
              <span aria-hidden="true" className="text-muted [&_svg]:size-4">
                <SourceIcon kind={source.kind} />
              </span>
              <Link
                to="/library/$sourceId"
                params={{ sourceId: source.id }}
                className="truncate hover:underline"
              >
                {source.title}
              </Link>
              <IconButton
                className="ml-auto"
                label={`Detach ${source.title}`}
                icon={<Unlink size={14} />}
                size="sm"
                onClick={() =>
                  actions.detachSource.mutate(
                    { id: lecture.id, sourceId: source.id },
                    { onError: notifyError },
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <select
          aria-label="Source to attach"
          className={cn(selectClasses, 'w-80')}
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value="">Choose a source from the library…</option>
          {candidates.map((source) => (
            <option key={source.id} value={source.id}>
              {source.moduleCode ? `${source.moduleCode} · ` : ''}
              {source.title}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={!choice}
          loading={actions.attachSource.isPending}
          onClick={() =>
            actions.attachSource.mutate(
              { id: lecture.id, sourceId: choice },
              { onSuccess: () => setChoice(''), onError: notifyError },
            )
          }
        >
          Attach
        </Button>
      </div>
    </StickySection>
  );
}

function LectureNotes({ lecture }: { lecture: LectureDetail }) {
  const api = useApi();
  const navigate = useNavigate();
  const tree = useQuery(treeQuery(api));
  const templates = useQuery(templatesQuery(api));
  const actions = useLearningActions();
  const createNote = useCreateNote();
  const [noteName, setNoteName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const listId = useId();
  const attachedIds = new Set(lecture.notes.map((note) => note.id));
  const candidates = (tree.data?.notes ?? []).filter((note) => !attachedIds.has(note.id));
  const chosen = candidates.find((note) => note.title === noteName || note.path === noteName);

  const create = () =>
    createNote.mutate(
      {
        title: `${lecture.key} ${lecture.title}`,
        folder: moduleFolder(lecture.module.code),
        module: lecture.module.code,
        lecture: `${lecture.module.code}/${lecture.key}`,
        ...(templateId ? { templateId } : {}),
      },
      {
        onSuccess: (note) => void navigate({ to: '/notes/$noteId', params: { noteId: note.id } }),
        onError: notifyError,
      },
    );

  return (
    <StickySection
      title="Notes"
      description={`Notes whose lecture property is ${lecture.module.code}/${lecture.key}.`}
      actions={
        <div className="flex items-center gap-2">
          <select
            aria-label="Template for the new note"
            className={cn(selectClasses, 'h-8 w-44')}
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            <option value="">No template</option>
            {(templates.data?.templates ?? []).map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={create} loading={createNote.isPending}>
            <FilePlus aria-hidden="true" size={14} />
            New lecture note
          </Button>
        </div>
      }
    >
      {lecture.notes.length > 0 && (
        <ul
          aria-label="Lecture notes"
          className="mb-3 divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {lecture.notes.map((note) => (
            <li key={note.id} className={rowClasses}>
              <Link
                to="/notes/$noteId"
                params={{ noteId: note.id }}
                className="truncate hover:underline"
              >
                {note.title}
              </Link>
              <span className="truncate text-xs text-subtle">{note.path}</span>
              <IconButton
                className="ml-auto"
                label={`Detach ${note.title}`}
                icon={<Unlink size={14} />}
                size="sm"
                onClick={() =>
                  actions.detachNote.mutate(
                    { id: lecture.id, noteId: note.id },
                    { onError: notifyError },
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Input
          aria-label="Existing note to attach"
          list={listId}
          className="w-80"
          placeholder="Attach an existing note by title…"
          value={noteName}
          onChange={(event) => setNoteName(event.target.value)}
        />
        <datalist id={listId}>
          {candidates.map((note) => (
            <option key={note.id} value={note.title}>
              {note.path}
            </option>
          ))}
        </datalist>
        <Button
          size="sm"
          disabled={!chosen}
          loading={actions.attachNote.isPending}
          onClick={() =>
            chosen &&
            actions.attachNote.mutate(
              { id: lecture.id, noteId: chosen.id },
              { onSuccess: () => setNoteName(''), onError: notifyError },
            )
          }
        >
          Attach
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Attaching sets the note’s <code>module</code> and <code>lecture</code> properties; editing
        them in the note works too.
      </p>
    </StickySection>
  );
}
