import type { CardSet } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Input } from '../../components/Input';
import { useApi } from '../../lib/api/context';
import { describeError } from '../../lib/notify';
import { moduleQuery, modulesQuery } from '../learning/api';
import { Field, FormError, selectClasses } from '../learning/Field';
import { useCardActions } from './api';

/** Creating or editing a card set: a title, and the module and lecture it belongs to. */
export function SetDialog({
  set,
  onClose,
  onSaved,
}: {
  set?: CardSet;
  onClose(): void;
  onSaved?(set: CardSet): void;
}) {
  const api = useApi();
  const modules = useQuery(modulesQuery(api));
  const actions = useCardActions();
  const [title, setTitle] = useState(set?.title ?? '');
  const [description, setDescription] = useState(set?.description ?? '');
  const [moduleId, setModuleId] = useState(set?.module?.id ?? '');
  const [lectureId, setLectureId] = useState(set?.lecture?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const module = useQuery({ ...moduleQuery(api, moduleId), enabled: moduleId !== '' });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = {
      title,
      description,
      moduleId: moduleId || null,
      lectureId: lectureId || null,
    };
    const options = {
      onSuccess: (saved: CardSet) => {
        onSaved?.(saved);
        onClose();
      },
      onError: (reason: unknown) => setError(describeError(reason).description),
    };
    if (set) actions.updateSet.mutate({ id: set.id, ...body }, options);
    else actions.createSet.mutate(body, options);
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={set ? 'Edit set' : 'New card set'}
    >
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Title">
          {(id) => (
            <Input
              id={id}
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </Field>
        <Field label="Description">
          {(id) => (
            <Input
              id={id}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Module">
            {(id) => (
              <select
                id={id}
                className={selectClasses}
                value={moduleId}
                onChange={(event) => {
                  setModuleId(event.target.value);
                  setLectureId('');
                }}
              >
                <option value="">No module</option>
                {(modules.data?.modules ?? []).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.code} {option.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Lecture">
            {(id) => (
              <select
                id={id}
                className={selectClasses}
                value={lectureId}
                disabled={!moduleId}
                onChange={(event) => setLectureId(event.target.value)}
              >
                <option value="">No lecture</option>
                {(module.data?.lectures ?? []).map((lecture) => (
                  <option key={lecture.id} value={lecture.id}>
                    {lecture.key} {lecture.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <FormError error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={actions.createSet.isPending || actions.updateSet.isPending}
          >
            {set ? 'Save' : 'Create set'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
