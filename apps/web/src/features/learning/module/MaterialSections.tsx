import type { ModuleDetail } from '@skb/core';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { FilePlus, Lightbulb } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { StickySection } from '../../../components/Page';
import { notifyError } from '../../../lib/notify';
import { useConceptActions } from '../../concepts/api';
import { SourceIcon } from '../../library/SourceRow';
import { useCreateNote } from '../../notes/api';
import { learningKeys } from '../api';

/** The module's sources, notes and concepts (task 6.11). */

const listClasses = 'divide-y divide-border rounded-lg border border-border bg-surface';
const itemClasses =
  'flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus';

/** Where notes for a module are created by default. */
export const moduleFolder = (code: string) => `Modules/${code}`;

export function MaterialSections({ module }: { module: ModuleDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createNote = useCreateNote();
  const concepts = useConceptActions();
  const [conceptName, setConceptName] = useState('');

  const newNote = () =>
    createNote.mutate(
      { title: `${module.code} notes`, folder: moduleFolder(module.code), module: module.code },
      {
        onSuccess: (note) => {
          void queryClient.invalidateQueries({ queryKey: learningKeys.all });
          void navigate({ to: '/notes/$noteId', params: { noteId: note.id } });
        },
        onError: notifyError,
      },
    );

  const addConcept = (event: FormEvent) => {
    event.preventDefault();
    const name = conceptName.trim();
    if (!name) return;
    concepts.create.mutate(
      { name, moduleIds: [module.id] },
      { onSuccess: () => setConceptName(''), onError: notifyError },
    );
  };

  return (
    <>
      <StickySection
        title="Sources"
        description={`Files in Sources/${module.code}/ — import with the module set to ${module.code} in the Library.`}
      >
        {module.sources.length === 0 ? (
          <p className="text-sm text-muted">No lecture material filed under this module yet.</p>
        ) : (
          <ul aria-label="Module sources" className={listClasses}>
            {module.sources.map((source) => (
              <li key={source.id}>
                <Link
                  to="/library/$sourceId"
                  params={{ sourceId: source.id }}
                  className={itemClasses}
                >
                  <span aria-hidden="true" className="text-muted [&_svg]:size-4">
                    <SourceIcon kind={source.kind} />
                  </span>
                  <span className="truncate">{source.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </StickySection>

      <StickySection
        title="Notes"
        description={`Notes whose module property is ${module.code}.`}
        actions={
          <Button size="sm" onClick={newNote} loading={createNote.isPending}>
            <FilePlus aria-hidden="true" size={14} />
            New note
          </Button>
        }
      >
        {module.notes.length === 0 ? (
          <p className="text-sm text-muted">
            No notes yet. Add <code>module: {module.code}</code> to a note’s properties, or create
            one here.
          </p>
        ) : (
          <ul aria-label="Module notes" className={listClasses}>
            {module.notes.map((note) => (
              <li key={note.id}>
                <Link to="/notes/$noteId" params={{ noteId: note.id }} className={itemClasses}>
                  <span className="truncate">{note.title}</span>
                  <span className="ml-auto truncate text-xs text-subtle">{note.path}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </StickySection>

      <StickySection title="Concepts" description="The ideas this module teaches.">
        {module.concepts.length > 0 && (
          <ul aria-label="Module concepts" className="mb-3 flex flex-wrap gap-2">
            {module.concepts.map((concept) => (
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
        <form className="flex items-center gap-2" onSubmit={addConcept}>
          <Input
            aria-label="New concept"
            placeholder="New concept, e.g. Paxos"
            className="w-64"
            value={conceptName}
            onChange={(event) => setConceptName(event.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!conceptName.trim()}
            loading={concepts.create.isPending}
          >
            Add concept
          </Button>
        </form>
      </StickySection>
    </>
  );
}
