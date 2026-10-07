import type { NoteDetail } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { Input } from '../../../components/Input';
import { useApi } from '../../../lib/api/context';
import { templatesQuery, useCreateNote } from '../api';

/** "New note" (task 3.19): title, folder, and optionally a template with course fields. */
export interface NewNoteDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  folders: readonly string[];
  defaultFolder: string;
  defaultTitle?: string;
  onCreated(note: NoteDetail): void;
}

const selectClasses =
  'h-9 w-full rounded-md border border-border-strong bg-surface px-2 text-sm text-text';

export function NewNoteDialog({
  open,
  onOpenChange,
  folders,
  defaultFolder,
  defaultTitle = '',
  onCreated,
}: NewNoteDialogProps) {
  const api = useApi();
  const templates = useQuery({ ...templatesQuery(api), enabled: open });
  const create = useCreateNote();
  const [title, setTitle] = useState(defaultTitle);
  const [folder, setFolder] = useState(defaultFolder);
  const [templateId, setTemplateId] = useState('');
  const [module, setModule] = useState('');
  const [lecture, setLecture] = useState('');
  const ids = {
    title: useId(),
    folder: useId(),
    template: useId(),
    module: useId(),
    lecture: useId(),
  };

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setFolder(defaultFolder);
    setTemplateId('');
    setModule('');
    setLecture('');
  }, [open, defaultFolder, defaultTitle]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      {
        title: title.trim() || undefined,
        folder,
        ...(templateId ? { templateId } : {}),
        ...(module.trim() ? { module: module.trim() } : {}),
        ...(lecture.trim() ? { lecture: lecture.trim() } : {}),
      },
      {
        onSuccess: (note) => {
          onOpenChange(false);
          onCreated(note);
        },
      },
    );
  };

  const formId = useId();
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New note"
      description="Notes are Markdown files in your vault; you can rename or move them later."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} loading={create.isPending}>
            Create note
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor={ids.title} className="block text-sm font-medium">
            Title
          </label>
          <Input
            id={ids.title}
            value={title}
            placeholder="Untitled"
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.folder} className="block text-sm font-medium">
            Folder
          </label>
          <select
            id={ids.folder}
            className={selectClasses}
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
          >
            <option value="">Vault root</option>
            {folders.map((path) => (
              <option key={path} value={path}>
                {path}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={ids.template} className="block text-sm font-medium">
            Template
          </label>
          <select
            id={ids.template}
            className={selectClasses}
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            <option value="">Blank note</option>
            {templates.data?.templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">
            {templates.data && templates.data.templates.length === 0
              ? `Add Markdown files to the “${templates.data.folder}” folder to use them as templates.`
              : 'Templates fill in {{title}}, {{date}}, {{time}}, {{module}} and {{lecture}}.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor={ids.module} className="block text-sm font-medium">
              Module <span className="font-normal text-muted">(optional)</span>
            </label>
            <Input
              id={ids.module}
              value={module}
              placeholder="COC251"
              onChange={(event) => setModule(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={ids.lecture} className="block text-sm font-medium">
              Lecture <span className="font-normal text-muted">(optional)</span>
            </label>
            <Input
              id={ids.lecture}
              value={lecture}
              placeholder="COC251/L03"
              onChange={(event) => setLecture(event.target.value)}
            />
          </div>
        </div>
      </form>
    </Dialog>
  );
}
