import {
  getNotesSettingsEndpoint,
  type NotesSettings,
  updateNotesSettingsEndpoint,
} from '@skb/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RadioGroup } from 'radix-ui';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Button } from '../../components/Button';
import { Input, Textarea } from '../../components/Input';
import { StickySection } from '../../components/Page';
import { ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { notifySuccess } from '../../lib/notify';

const SETTINGS_KEY = ['settings', 'notes'] as const;

const ID_OPTIONS: { value: NotesSettings['assignIds']; label: string; description: string }[] = [
  {
    value: 'on-demand',
    label: 'Only when needed (recommended)',
    description:
      'An id is added to a note’s properties only when other data must refer to it. Notes you never use that way are not changed.',
  },
  {
    value: 'on-index',
    label: 'Every note',
    description:
      'Every note gets an id property when it is first indexed, so links from cards and concepts survive any rename.',
  },
];

/** Vault settings for notes: ids, ignored paths, special folders and the trash. */
export function NotesSettingsSection() {
  const api = useApi();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => api.request(getNotesSettingsEndpoint),
  });
  const save = useMutation({
    mutationFn: (body: Partial<NotesSettings>) =>
      api.request(updateNotesSettingsEndpoint, { body }),
    onSuccess: (next) => {
      queryClient.setQueryData(SETTINGS_KEY, next);
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      notifySuccess('Notes settings saved');
    },
  });
  const [draft, setDraft] = useState<NotesSettings | null>(null);
  const [ignore, setIgnore] = useState('');
  const ids = {
    label: useId(),
    ignore: useId(),
    attachments: useId(),
    templates: useId(),
    retention: useId(),
  };

  useEffect(() => {
    if (settings.data) {
      setDraft(settings.data);
      setIgnore(settings.data.ignorePatterns.join('\n'));
    }
  }, [settings.data]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    save.mutate({
      ...draft,
      ignorePatterns: ignore
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    });
  };

  return (
    <StickySection
      title="Notes"
      description="How notes are identified and which files are indexed."
    >
      {settings.isPending && <LoadingState label="Loading notes settings" />}
      {settings.isError && (
        <ErrorState message={settings.error.message} onRetry={() => void settings.refetch()} />
      )}
      {draft && (
        <form onSubmit={submit} className="space-y-6">
          <div>
            <div id={ids.label} className="mb-2 text-sm font-medium">
              Note ids
            </div>
            <RadioGroup.Root
              aria-labelledby={ids.label}
              value={draft.assignIds}
              onValueChange={(value) =>
                setDraft({ ...draft, assignIds: value as NotesSettings['assignIds'] })
              }
              className="grid gap-3 sm:grid-cols-2"
            >
              {ID_OPTIONS.map((option) => (
                <RadioGroup.Item
                  key={option.value}
                  value={option.value}
                  className={cn(
                    'rounded-lg border border-border bg-surface p-3 text-left',
                    'hover:border-border-strong data-[state=checked]:border-accent data-[state=checked]:bg-accent-subtle',
                  )}
                >
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-1 block text-xs text-muted">{option.description}</span>
                </RadioGroup.Item>
              ))}
            </RadioGroup.Root>
          </div>
          <div className="space-y-1">
            <label htmlFor={ids.ignore} className="block text-sm font-medium">
              Leave out of the index
            </label>
            <Textarea
              id={ids.ignore}
              rows={4}
              value={ignore}
              placeholder={'Archive/\n*.excalidraw.md'}
              className="font-mono text-xs"
              onChange={(event) => setIgnore(event.target.value)}
            />
            <p className="text-xs text-muted">
              One pattern per line. A name matches at any depth, a leading / anchors it to the
              vault, a trailing / means a folder, and * and ** are wildcards. .skb, .obsidian, .git
              and hidden folders are always left out.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor={ids.attachments} className="block text-sm font-medium">
                Attachments folder
              </label>
              <Input
                id={ids.attachments}
                value={draft.attachmentsFolder}
                onChange={(event) => setDraft({ ...draft, attachmentsFolder: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={ids.templates} className="block text-sm font-medium">
                Templates folder
              </label>
              <Input
                id={ids.templates}
                value={draft.templatesFolder}
                onChange={(event) => setDraft({ ...draft, templatesFolder: event.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={ids.retention} className="block text-sm font-medium">
                Keep deleted items (days)
              </label>
              <Input
                id={ids.retention}
                type="number"
                min={1}
                max={3650}
                value={draft.trashRetentionDays}
                onChange={(event) =>
                  setDraft({ ...draft, trashRetentionDays: Number(event.target.value) })
                }
              />
            </div>
          </div>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Save notes settings
          </Button>
        </form>
      )}
    </StickySection>
  );
}
