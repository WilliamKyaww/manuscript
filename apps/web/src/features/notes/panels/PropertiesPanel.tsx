import {
  FrontmatterEditError,
  parseFrontmatter,
  setFrontmatterValues,
  splitFrontmatter,
  stringList,
} from '@skb/core/markdown';
import { TriangleAlert } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Button } from '../../../components/Button';
import { Input, Textarea } from '../../../components/Input';
import { notifyError } from '../../../lib/notify';
import { AddProperty } from './AddProperty';

/**
 * Frontmatter properties (task 3.17): typed fields for the keys the app understands, the other keys
 * listed, and the raw YAML for anything else. Every change is written into the note's text with the
 * comment-preserving editor, so it is saved like any other edit.
 */

const NOTE_TYPES = ['note', 'lecture-notes', 'summary', 'revision', 'concept', 'journal'];
const KNOWN = new Set([
  'id',
  'skb-id',
  'title',
  'type',
  'tags',
  'tag',
  'aliases',
  'alias',
  'module',
  'lecture',
  'created',
]);

interface Props {
  text: string;
  readOnly: boolean;
  onChange(text: string): void;
  /** "Add file property" was chosen: open the new-property form, focus it, and say so. */
  addRequested?: boolean;
  onAddHandled?(): void;
}

function display(value: unknown): string {
  if (Array.isArray(value)) return value.map(display).join(', ');
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: (id: string) => ReactNode;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-muted">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </div>
  );
}

/** A text input that commits on blur or Enter (so the note is not rewritten on every keystroke). */
function CommitInput({
  id,
  value,
  onCommit,
  disabled,
  list,
}: {
  id: string;
  value: string;
  onCommit(value: string): void;
  disabled: boolean;
  list?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }
  return (
    <Input
      id={id}
      value={draft}
      list={list}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (draft !== value) onCommit(draft);
        }
      }}
    />
  );
}

export function PropertiesPanel({
  text,
  readOnly,
  onChange,
  addRequested = false,
  onAddHandled,
}: Props) {
  const split = splitFrontmatter(text);
  const { data, error } = split.present ? parseFrontmatter(split.yaml) : { data: {}, error: null };
  const [editingYaml, setEditingYaml] = useState(false);
  const [yaml, setYaml] = useState('');
  const typesListId = useId();

  const update = (key: string, value: unknown) => {
    try {
      onChange(setFrontmatterValues(text, { [key]: value }));
    } catch (failure) {
      notifyError(failure instanceof FrontmatterEditError ? new Error(failure.message) : failure);
    }
  };
  const setText = (key: string, value: string) =>
    update(key, value.trim() === '' ? undefined : value.trim());
  const setList = (key: string, value: string) => {
    const items = stringList(value).map((item) => item.replace(/^#/, ''));
    update(key, items.length === 0 ? undefined : items);
  };
  const applyYaml = () => {
    const parsed = parseFrontmatter(yaml);
    if (parsed.error) {
      notifyError(new Error(parsed.error));
      return;
    }
    const body = text.slice(split.bodyStart);
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const block =
      yaml.trim() === ''
        ? ''
        : `---${eol}${yaml.replace(/\r?\n/g, eol).replace(/\s*$/, eol)}---${eol}`;
    const bom = text.startsWith('﻿') ? '﻿' : '';
    onChange(bom + block + body);
    setEditingYaml(false);
  };

  const others = Object.entries(data).filter(([key]) => !KNOWN.has(key));
  const disabled = readOnly || error !== null;

  return (
    <div className="space-y-4 p-3 text-sm">
      {error && (
        <p role="alert" className="flex gap-2 rounded-md bg-warning-subtle p-2 text-text">
          <TriangleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-warning" />
          <span>
            {error} Fix it in the YAML below or in the editor; until then the properties cannot be
            edited here.
          </span>
        </p>
      )}
      <Field label="Title" hint="Shown instead of the file name; optional.">
        {(id) => (
          <CommitInput
            id={id}
            value={display(data.title)}
            disabled={disabled}
            onCommit={(value) => setText('title', value)}
          />
        )}
      </Field>
      <Field label="Type">
        {(id) => (
          <>
            <CommitInput
              id={id}
              value={display(data.type)}
              disabled={disabled}
              list={typesListId}
              onCommit={(value) => setText('type', value)}
            />
            <datalist id={typesListId}>
              {NOTE_TYPES.map((type) => (
                <option key={type} value={type} />
              ))}
            </datalist>
          </>
        )}
      </Field>
      <Field label="Tags" hint="Separate with commas.">
        {(id) => (
          <CommitInput
            id={id}
            value={display(data.tags ?? data.tag)}
            disabled={disabled}
            onCommit={(value) =>
              setList(data.tag !== undefined && data.tags === undefined ? 'tag' : 'tags', value)
            }
          />
        )}
      </Field>
      <Field label="Aliases" hint="Other names that link to this note; separate with commas.">
        {(id) => (
          <CommitInput
            id={id}
            value={display(data.aliases ?? data.alias)}
            disabled={disabled}
            onCommit={(value) =>
              setList(
                data.alias !== undefined && data.aliases === undefined ? 'alias' : 'aliases',
                value,
              )
            }
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Module">
          {(id) => (
            <CommitInput
              id={id}
              value={display(data.module)}
              disabled={disabled}
              onCommit={(value) => setText('module', value)}
            />
          )}
        </Field>
        <Field label="Lecture">
          {(id) => (
            <CommitInput
              id={id}
              value={display(data.lecture)}
              disabled={disabled}
              onCommit={(value) => setText('lecture', value)}
            />
          )}
        </Field>
      </div>
      {(data.created !== undefined || data.id !== undefined || data['skb-id'] !== undefined) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {data.created !== undefined && (
            <>
              <dt className="text-muted">Created</dt>
              <dd>{display(data.created)}</dd>
            </>
          )}
          {(data.id !== undefined || data['skb-id'] !== undefined) && (
            <>
              <dt className="text-muted">Id</dt>
              <dd className="break-all font-mono">{display(data['skb-id'] ?? data.id)}</dd>
            </>
          )}
        </dl>
      )}

      {others.length > 0 && !editingYaml && (
        <div>
          <h3 className="eyebrow mb-1">Other properties</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {others.map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="font-medium">{key}</dt>
                <dd className="break-words text-muted">{display(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {!disabled && !editingYaml && (
        <AddProperty
          requested={addRequested}
          onHandled={onAddHandled}
          onAdd={(key, value) => update(key, value)}
        />
      )}

      {editingYaml ? (
        <Field label="Frontmatter (YAML)">
          {(id) => (
            <div className="space-y-2">
              <Textarea
                id={id}
                rows={10}
                value={yaml}
                onChange={(event) => setYaml(event.target.value)}
                className="font-mono text-xs"
                spellCheck={false}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={applyYaml}>
                  Apply
                </Button>
                <Button size="sm" onClick={() => setEditingYaml(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Field>
      ) : (
        <Button
          size="sm"
          disabled={readOnly}
          onClick={() => {
            setYaml(split.present ? split.yaml.replace(/\r\n/g, '\n') : '');
            setEditingYaml(true);
          }}
        >
          Edit YAML
        </Button>
      )}
    </div>
  );
}
