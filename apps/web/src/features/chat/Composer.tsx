import {
  ASK_SCOPES,
  type AskScope,
  CHAT_MODES,
  type ChatMode,
  type Mention,
  type SendMessageInput,
} from '@skb/core';
import { Send, Square, X } from 'lucide-react';
import { type KeyboardEvent, useId, useRef, useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Kbd } from '../../components/Kbd';
import { cn } from '../../lib/cn';
import type { PageScope } from '../ai/usePageScope';
import { selectClasses } from '../learning/Field';
import { textareaClasses } from '../practice/AnswerKeyEditor';
import { type MentionOption, useMentionOptions } from './mentions';

/**
 * The message box (task 13.08): the mode and scope of the conversation, @mentions of notes,
 * concepts, modules, lectures and sources, the page on screen (and any text selected on it), and
 * Stop while the assistant is working.
 */

export const MODE_LABELS: Record<ChatMode, { label: string; hint: string }> = {
  assistant: {
    label: 'Assistant',
    hint: 'Answers and can make notes, cards and quizzes; asks before anything risky',
  },
  tutor: {
    label: 'Tutor',
    hint: 'Guides you with questions and hints instead of giving answers away',
  },
  read_only: { label: 'Read only', hint: 'Answers from your material and changes nothing' },
};

export const SCOPE_LABELS: Record<AskScope, { label: string; hint: string }> = {
  sources: { label: 'My sources', hint: 'Lecture material only; says so if it is not there' },
  knowledge: { label: 'Sources and notes', hint: 'Your lecture material and your own notes' },
  general: { label: 'General knowledge too', hint: 'May add what the model knows, marked as such' },
};

const MENTION_AT_CARET = /(^|\s)@([^\s@]{0,40})$/u;

export interface ComposerProps {
  mode: ChatMode;
  scope: AskScope;
  onSettings(patch: { mode?: ChatMode; scope?: AskScope }): void;
  /** The assistant is working (this thread or another run). */
  busy: boolean;
  /** The reason the person cannot send (waiting for an approval, no model). */
  blocked: string | null;
  page: PageScope | null;
  selection: string;
  onClearSelection(): void;
  onSend(input: SendMessageInput): void;
  onStop(): void;
  /** Compact controls for the side panel. */
  compact?: boolean;
}

export function Composer({
  mode,
  scope,
  onSettings,
  busy,
  blocked,
  page,
  selection,
  onClearSelection,
  onSend,
  onStop,
  compact,
}: ComposerProps) {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  // Narrowed to the page by default; widening applies to that page only.
  const pageKey = page && Object.keys(page.filter).length > 0 ? JSON.stringify(page.filter) : null;
  const [widenedFor, setWidenedFor] = useState<string | null>(null);
  const narrow = pageKey !== null && widenedFor !== pageKey;
  const field = useRef<HTMLTextAreaElement>(null);
  const listId = useId();

  const trigger = MENTION_AT_CARET.exec(text.slice(0, caret));
  const query = trigger && !dismissed ? (trigger[2] ?? '') : null;
  const options = useMentionOptions(query);

  const pick = (option: MentionOption) => {
    if (!trigger) return;
    const start = caret - (trigger[2]?.length ?? 0) - 1;
    const label = option.label.replace(/\s+/gu, ' ');
    const next = `${text.slice(0, start)}@${label} ${text.slice(caret)}`;
    setText(next);
    setMentions((current) =>
      current.some((entry) => entry.id === option.id)
        ? current
        : [...current, { kind: option.kind, id: option.id, label }],
    );
    const position = start + label.length + 2;
    requestAnimationFrame(() => {
      field.current?.focus();
      field.current?.setSelectionRange(position, position);
      setCaret(position);
    });
  };

  const submit = () => {
    const message = text.trim();
    if (!message || busy || blocked) return;
    onSend({
      text: message,
      // A mention stays only while its @name is still in the text.
      mentions: mentions.filter((mention) => message.includes(`@${mention.label}`)),
      ...(page
        ? {
            context: {
              label: `viewing ${page.label}`,
              filter: page.filter,
              ...(page.noteId ? { noteId: page.noteId } : {}),
              ...(selection ? { selection } : {}),
            },
          }
        : selection
          ? { context: { label: 'reading the page', filter: {}, selection } }
          : {}),
      onlyThisPage: narrow,
    });
    setText('');
    setMentions([]);
    onClearSelection();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (query !== null && options.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((current) => (current + step + options.length) % options.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const option = options[active];
        if (option) pick(option);
        return;
      }
    }
    if (query !== null && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setDismissed(true);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      aria-label="Message the assistant"
      className="space-y-2 border-t border-border bg-surface p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {selection && (
        <p className="flex items-center gap-2 text-xs">
          <Badge tone="accent">
            Selected text · {selection.length.toLocaleString('en-GB')} characters
          </Badge>
          <button
            type="button"
            className="rounded p-0.5 hover:bg-surface-hover"
            aria-label="Remove the selected text"
            onClick={onClearSelection}
          >
            <X aria-hidden="true" size={12} />
          </button>
        </p>
      )}
      <div className="relative">
        <textarea
          ref={field}
          aria-label="Message"
          aria-autocomplete="list"
          aria-controls={query !== null && options.length > 0 ? listId : undefined}
          aria-activedescendant={
            query !== null && options.length > 0 ? `${listId}-${active}` : undefined
          }
          rows={compact ? 2 : 3}
          className={cn(textareaClasses, 'font-sans')}
          placeholder={
            blocked ??
            'Ask about your material, or tell me what to make. @ mentions a note, concept, module…'
          }
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setCaret(event.target.selectionStart);
            setDismissed(false);
            setActive(0);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          disabled={Boolean(blocked) && !busy}
        />
        {query !== null && options.length > 0 && (
          <div
            id={listId}
            role="listbox"
            aria-label="Mention suggestions"
            className="absolute bottom-full left-0 z-20 mb-1 max-h-64 w-full overflow-auto rounded-md border border-border-strong bg-surface p-1 shadow-lg"
          >
            {options.map((option, index) => (
              <div
                key={`${option.kind}:${option.id}`}
                id={`${listId}-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === active}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm',
                  index === active && 'bg-surface-hover',
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(option);
                }}
              >
                <Badge>{option.kind}</Badge>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Mode"
          title={MODE_LABELS[mode].hint}
          className={cn(selectClasses, 'w-auto')}
          value={mode}
          disabled={busy}
          onChange={(event) => onSettings({ mode: event.target.value as ChatMode })}
        >
          {CHAT_MODES.map((value) => (
            <option key={value} value={value}>
              {MODE_LABELS[value].label}
            </option>
          ))}
        </select>
        <select
          aria-label="Answer from"
          title={SCOPE_LABELS[scope].hint}
          className={cn(selectClasses, 'w-auto')}
          value={scope}
          disabled={busy}
          onChange={(event) => onSettings({ scope: event.target.value as AskScope })}
        >
          {ASK_SCOPES.map((value) => (
            <option key={value} value={value}>
              {SCOPE_LABELS[value].label}
            </option>
          ))}
        </select>
        {pageKey && page && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={narrow}
              onChange={() => setWidenedFor(narrow ? pageKey : null)}
            />
            Only {page.label}
          </label>
        )}
        <span className="flex-1" />
        {busy ? (
          <Button type="button" onClick={onStop}>
            <Square aria-hidden="true" size={14} /> Stop
          </Button>
        ) : (
          <Button type="submit" variant="primary" disabled={!text.trim() || Boolean(blocked)}>
            <Send aria-hidden="true" size={14} /> Send {!compact && <Kbd>Enter</Kbd>}
          </Button>
        )}
      </div>
    </form>
  );
}
