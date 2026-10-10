import type { LectureDetail } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { FilePlus, Unlink } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Input } from '../../components/Input';
import { StickySection } from '../../components/Page';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { notifyError } from '../../lib/notify';
import { sourcesQuery } from '../library/api';
import { SourceIcon } from '../library/SourceRow';
import { templatesQuery, treeQuery, useCreateNote } from '../notes/api';
import { useLearningActions } from './api';
import { selectClasses } from './Field';
import { moduleFolder } from './module/MaterialSections';

/** A lecture's sources and notes, each attached from the library or the vault (task 6.12). */

const rowClasses = 'flex items-center gap-2 px-3 py-1.5 text-sm';

export function LectureSources({ lecture }: { lecture: LectureDetail }) {
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

export function LectureNotes({ lecture }: { lecture: LectureDetail }) {
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
