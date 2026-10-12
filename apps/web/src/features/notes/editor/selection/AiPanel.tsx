import type { WritingAction } from '@skb/core';
import { Copy, RotateCw, Sparkles, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { Button } from '../../../../components/Button';
import { IconButton } from '../../../../components/IconButton';
import { Spinner } from '../../../../components/Spinner';
import { notifyError, notifySuccess } from '../../../../lib/notify';
import { useWritingHelp } from '../../../ai/api';
import { AI_ACTIONS } from './actions';
import { type EditorHub, placeOver } from './hub';

/**
 * The answer to an AI action on the selection (Phase 26): shown under the text as a suggestion, with
 * Replace (or, for Explain and Summarise, Insert below), Copy and Try again. Nothing changes in the
 * note until the student chooses; a replacement is one undoable edit.
 */

export interface AiRequest {
  hub: EditorHub;
  action: WritingAction;
  instruction?: string;
  from: number;
  to: number;
  original: string;
  title: string;
  /** Bumped by Try again. */
  attempt: number;
}

export const useAiRequest = create<{
  request: AiRequest | null;
  ask(request: Omit<AiRequest, 'attempt'>): void;
  retry(): void;
  close(): void;
}>((set, get) => ({
  request: null,
  ask: (request) => set({ request: { ...request, attempt: 0 } }),
  retry: () => {
    const current = get().request;
    if (current) set({ request: { ...current, attempt: current.attempt + 1 } });
  },
  close: () => set({ request: null }),
}));

const labelOf = (action: WritingAction) =>
  action === 'custom'
    ? 'Edit with AI'
    : (AI_ACTIONS.find((entry) => entry.action === action)?.label ?? 'AI');

export function AiPanel({ hub }: { hub: EditorHub }) {
  const request = useAiRequest((state) => state.request);
  const mine = request?.hub === hub ? request : null;
  return mine ? <Panel key={`${mine.from}:${mine.action}`} request={mine} /> : null;
}

function Panel({ request }: { request: AiRequest }) {
  const { hub } = request;
  const view = hub.view;
  const writing = useWritingHelp();
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const beside =
    !AI_ACTIONS.find((entry) => entry.action === request.action)?.changes &&
    request.action !== 'custom';
  const { mutate } = writing;

  // biome-ignore lint/correctness/useExhaustiveDependencies: one request per attempt.
  useEffect(() => {
    mutate({
      action: request.action,
      text: request.original,
      instruction: request.instruction,
      title: request.title,
    });
  }, [request.attempt]);

  // Placed again when the answer arrives: the panel grows with it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the status changes the panel's height.
  useLayoutEffect(() => {
    if (!view) return;
    const width = Math.min(560, window.innerWidth - 32);
    const height = panel.current?.offsetHeight ?? 180;
    const below = view.coordsAtPos(request.to, -1);
    if (!below) return setPosition(placeOver(view, request.from, request.to, { width, height }));
    const left = Math.max(16, Math.min(below.left - 40, window.innerWidth - width - 16));
    const top = Math.min(below.bottom + 10, window.innerHeight - height - 16);
    setPosition({ left, top });
  }, [view, request, writing.status]);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  if (!view) return null;
  const close = () => {
    useAiRequest.getState().close();
    view.focus();
  };
  const result = writing.data?.text ?? '';

  /** The selected text, where it is now (the note may have changed while the answer was coming). */
  const locate = (): { from: number; to: number } | null => {
    const { from, to, original } = request;
    if (view.state.sliceDoc(from, to) === original) return { from, to };
    const at = view.state.doc.toString().indexOf(original);
    return at === -1 ? null : { from: at, to: at + original.length };
  };
  const replace = () => {
    const range = locate();
    if (!range) {
      notifyError(new Error('The selected text has changed. Copy the suggestion instead.'));
      return;
    }
    view.dispatch({
      changes: { ...range, insert: result },
      selection: { anchor: range.from, head: range.from + result.length },
      scrollIntoView: true,
      userEvent: 'input.ai',
    });
    close();
  };
  const insertBelow = () => {
    const range = locate() ?? { from: request.to, to: request.to };
    const line = view.state.doc.lineAt(range.to);
    const insert = `\n\n${result}`;
    view.dispatch({
      changes: { from: line.to, insert },
      selection: { anchor: line.to + 2, head: line.to + insert.length },
      scrollIntoView: true,
      userEvent: 'input.ai',
    });
    close();
  };
  const copy = () =>
    navigator.clipboard.writeText(result).then(() => notifySuccess('Copied'), notifyError);

  return createPortal(
    <div
      ref={panel}
      data-overlay
      data-ai-panel
      role="dialog"
      aria-modal="false"
      aria-label={labelOf(request.action)}
      tabIndex={-1}
      className="fixed z-40 flex w-[min(35rem,calc(100vw-2rem))] animate-fade-in flex-col rounded-lg border border-border bg-surface-raised text-sm shadow-lg outline-none"
      style={position ?? { left: -9999, top: -9999 }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Sparkles aria-hidden="true" size={14} className="text-accent" />
        <span className="font-medium">{labelOf(request.action)}</span>
        {request.instruction && (
          <span className="min-w-0 truncate text-muted">— {request.instruction}</span>
        )}
        <span className="ml-auto text-xs text-subtle">{writing.data?.model}</span>
        <IconButton
          label="Close"
          icon={<X size={14} />}
          size="sm"
          tooltip={false}
          onClick={close}
        />
      </div>
      <div className="max-h-[40vh] overflow-y-auto px-3 py-2.5" aria-live="polite">
        {writing.isPending && (
          <span className="flex items-center gap-2 text-muted">
            <Spinner size="sm" label="" /> Writing…
          </span>
        )}
        {writing.isError && (
          <p className="text-danger">
            {writing.error instanceof Error
              ? writing.error.message
              : 'The answer could not be written.'}
          </p>
        )}
        {writing.isSuccess && <p className="whitespace-pre-wrap">{result}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
        {writing.isSuccess && !beside && (
          <Button size="sm" variant="primary" onClick={replace} disabled={view.state.readOnly}>
            Replace selection
          </Button>
        )}
        {writing.isSuccess && (
          <Button
            size="sm"
            variant={beside ? 'primary' : 'secondary'}
            onClick={insertBelow}
            disabled={view.state.readOnly}
          >
            Insert below
          </Button>
        )}
        {writing.isSuccess && (
          <Button size="sm" variant="ghost" onClick={() => void copy()}>
            <Copy aria-hidden="true" size={13} /> Copy
          </Button>
        )}
        {!writing.isPending && (
          <Button size="sm" variant="ghost" onClick={() => useAiRequest.getState().retry()}>
            <RotateCw aria-hidden="true" size={13} /> Try again
          </Button>
        )}
        <span className="ml-auto text-xs text-subtle">
          AI can be wrong — read it before you use it.
        </span>
      </div>
    </div>,
    document.body,
  );
}
