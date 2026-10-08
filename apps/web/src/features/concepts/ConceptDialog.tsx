import type { ConceptSummary } from '@skb/core';
import { useQueries, useQuery } from '@tanstack/react-query';
import { type FormEvent, useId, useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input, Textarea } from '../../components/Input';
import { useApi } from '../../lib/api/context';
import { describeError } from '../../lib/notify';
import { moduleQuery, modulesQuery } from '../learning/api';
import { Field, FormError, selectClasses } from '../learning/Field';
import { flattenTopics } from '../learning/module/TopicsSection';
import { treeQuery } from '../notes/api';
import { useConceptActions } from './api';

/** Create or edit a concept (task 6.13). Aliases are comma-separated. */

export const parseAliases = (text: string) => [
  ...new Set(
    text
      .split(',')
      .map((alias) => alias.trim())
      .filter(Boolean),
  ),
];

export function ConceptDialog({
  concept,
  initialName = '',
  onClose,
  onSaved,
}: {
  concept?: ConceptSummary;
  initialName?: string;
  onClose(): void;
  onSaved?(concept: ConceptSummary): void;
}) {
  const api = useApi();
  const actions = useConceptActions();
  const modules = useQuery(modulesQuery(api));
  const tree = useQuery(treeQuery(api));
  const [name, setName] = useState(concept?.name ?? initialName);
  const [aliases, setAliases] = useState(concept?.aliases.join(', ') ?? '');
  const [summary, setSummary] = useState(concept?.summary ?? '');
  const [importance, setImportance] = useState(String(concept?.importance ?? 1));
  const [moduleIds, setModuleIds] = useState<string[]>(concept?.moduleIds ?? []);
  const [topicIds, setTopicIds] = useState<string[]>(concept?.topicIds ?? []);
  const notes = tree.data?.notes ?? [];
  const [noteName, setNoteName] = useState(
    notes.find((note) => note.id === concept?.noteId)?.title ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const notesListId = useId();
  const details = useQueries({ queries: moduleIds.map((id) => moduleQuery(api, id)) });
  const topics = details.flatMap((result) =>
    result.data
      ? flattenTopics(result.data.topics).map((node) => ({ ...node, module: result.data.code }))
      : [],
  );

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const note = noteName.trim()
      ? notes.find((item) => item.title === noteName.trim() || item.path === noteName.trim())
      : null;
    if (noteName.trim() && !note) {
      setError(`No note is called “${noteName.trim()}”.`);
      return;
    }
    const body = {
      name: name.trim(),
      aliases: parseAliases(aliases),
      summary,
      importance: Number(importance),
      moduleIds,
      // Topics only count while their module is selected.
      topicIds: topicIds.filter((id) => topics.some((node) => node.topic.id === id)),
      noteId: note?.id ?? null,
    };
    const options = {
      onSuccess: (saved: ConceptSummary) => {
        onSaved?.(saved);
        onClose();
      },
      onError: (reason: unknown) => setError(describeError(reason).description),
    };
    if (concept) actions.update.mutate({ id: concept.id, ...body }, options);
    else actions.create.mutate(body, options);
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={concept ? 'Edit concept' : 'New concept'}
      size="lg"
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field label="Name" hint="[[Name]] in a note links here when no note has that name.">
            {(id, hint) => (
              <Input
                id={id}
                aria-describedby={hint}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <Field label="Importance">
            {(id) => (
              <select
                id={id}
                className={selectClasses}
                value={importance}
                onChange={(event) => setImportance(event.target.value)}
              >
                <option value="0.5">Minor</option>
                <option value="1">Normal</option>
                <option value="1.5">Important</option>
                <option value="2">Core</option>
              </select>
            )}
          </Field>
        </div>
        <Field label="Aliases" hint="Other names, separated by commas — they link here too.">
          {(id, hint) => (
            <Input
              id={id}
              aria-describedby={hint}
              value={aliases}
              onChange={(event) => setAliases(event.target.value)}
            />
          )}
        </Field>
        <Field label="Summary" hint="One to three sentences; Markdown and maths work.">
          {(id, hint) => (
            <Textarea
              id={id}
              aria-describedby={hint}
              rows={3}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          )}
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Modules</legend>
          {(modules.data?.modules ?? []).length === 0 ? (
            <p className="text-xs text-muted">No modules yet.</p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(modules.data?.modules ?? []).map((module) => (
                <label key={module.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={moduleIds.includes(module.id)}
                    onChange={() => setModuleIds(toggle(moduleIds, module.id))}
                  />
                  {module.code} <span className="text-muted">{module.title}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        {topics.length > 0 && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Topics</legend>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {topics.map(({ topic, depth, module }) => (
                <label
                  key={topic.id}
                  className="flex items-center gap-1.5 text-sm"
                  style={{ paddingLeft: `${depth * 1.25}rem` }}
                >
                  <input
                    type="checkbox"
                    checked={topicIds.includes(topic.id)}
                    onChange={() => setTopicIds(toggle(topicIds, topic.id))}
                  />
                  {topic.title} <span className="text-xs text-muted">{module}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Field label="Backing note" hint="Optional: a note that explains the concept in depth.">
          {(id, hint) => (
            <>
              <Input
                id={id}
                aria-describedby={hint}
                list={notesListId}
                value={noteName}
                onChange={(event) => setNoteName(event.target.value)}
              />
              <datalist id={notesListId}>
                {notes.map((note) => (
                  <option key={note.id} value={note.title}>
                    {note.path}
                  </option>
                ))}
              </datalist>
            </>
          )}
        </Field>
        <FormError error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={actions.create.isPending || actions.update.isPending}
          >
            {concept ? 'Save' : 'Create concept'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
