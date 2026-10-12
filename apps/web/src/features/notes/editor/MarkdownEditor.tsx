import { openSearchPanel } from '@codemirror/search';
import { Annotation, ChangeSet, Compartment, EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { changedRange } from '../../../lib/diff';
import { type CompletionData, createExtensions, type EditorCallbacks } from './extensions';
import { contextFromAttachments, livePreviewContext } from './live/context';
import { livePreview } from './live-preview';
import type { EditorTools } from './selection/actions';
import { createHub } from './selection/hub';
import { SelectionLayer } from './selection/SelectionLayer';

/**
 * Positions and ranges passed to the handle count every line break as one character (as CodeMirror
 * does), whatever the file's line endings; inserted text may use `\n` and is converted.
 */

/** Marks changes made by the app (not typed by the user), e.g. applying a newer version from disk. */
export const externalChange = Annotation.define<boolean>();

export interface MarkdownEditorHandle {
  focus(): void;
  getText(): string;
  /** Replaces the text by changing only the part that differs, so the cursor stays put. */
  setText(text: string): void;
  /** Starts recording edits so that a change to this version can be applied later. */
  checkpoint(): number;
  /**
   * Applies a replacement of [from, to) in the checkpointed version, mapped through everything typed
   * since. The change is kept out of the undo history (it came from the server, not the user).
   */
  applyToCheckpoint(checkpoint: number, from: number, to: number, insert: string): void;
  releaseCheckpoint(checkpoint: number): void;
  insertAt(position: number, text: string): void;
  /** Scrolls a 1-based line into view and puts the cursor there. */
  goToLine(line: number): void;
  /** The selected text and the 1-based line it starts on, or null when nothing is selected. */
  getSelection(): { text: string; line: number } | null;
  /** Opens the find bar (task 23.08), with the cursor in its replace field if `replace`. */
  openSearch(options?: { replace?: boolean }): void;
}

export interface MarkdownEditorProps extends EditorCallbacks {
  /** Changing the key starts a fresh editor state (another note). */
  docKey: string;
  initialText: string;
  readOnly: boolean;
  lineSeparator: '\r\n' | null;
  completions: CompletionData;
  /** Hide the marks of Markdown outside the element under the cursor. */
  livePreview?: boolean;
  /**
   * The page's tools for the selection (Phase 26): with them, the editor has its right-click menu,
   * the toolbar over a selection and AI suggestions; without, it is a plain editor.
   */
  tools?: EditorTools;
  className?: string;
}

const LINE_BREAK = /\r\n?|\n/g;

/** CodeMirror 6 Markdown editor (task 3.14); the view is created once and reused across notes. */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    {
      docKey,
      initialText,
      readOnly,
      lineSeparator,
      completions,
      livePreview: live = false,
      tools,
      className,
      ...callbacks
    },
    ref,
  ) {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<EditorView | null>(null);
    const latest = useRef(callbacks);
    latest.current = callbacks;
    const data = useRef(completions);
    data.current = completions;
    const liveCompartment = useRef(new Compartment());
    const liveNow = useRef(live);
    liveNow.current = live;
    const checkpoints = useRef(new Map<number, ChangeSet>());
    const nextCheckpoint = useRef(1);
    const [hub] = useState(createHub);

    const makeState = (text: string) =>
      EditorState.create({
        doc: text,
        extensions: [
          ...createExtensions({
            data: {
              notes: () => data.current.notes(),
              attachments: () => data.current.attachments(),
              tags: () => data.current.tags(),
            },
            callbacks: () => latest.current,
            readOnly,
            lineSeparator,
            extra: [
              livePreviewContext.of(contextFromAttachments(() => data.current.attachments())),
              liveCompartment.current.of(liveNow.current ? livePreview : []),
            ],
          }),
          EditorView.updateListener.of((update) => {
            if (
              update.selectionSet ||
              update.focusChanged ||
              update.geometryChanged ||
              update.docChanged
            )
              hub.notify();
            if (!update.docChanged) return;
            for (const [id, changes] of checkpoints.current) {
              checkpoints.current.set(id, changes.compose(update.changes));
            }
          }),
        ],
      });

    // Create the view once; later notes swap in a new state.
    // biome-ignore lint/correctness/useExhaustiveDependencies: the view is created on mount only; docKey changes are handled below.
    useEffect(() => {
      if (!host.current) return;
      view.current = new EditorView({ state: makeState(initialText), parent: host.current });
      hub.view = view.current;
      hub.notify();
      return () => {
        view.current?.destroy();
        view.current = null;
        hub.view = null;
      };
    }, []);

    // Switching live preview on or off keeps the text, the cursor and the undo history.
    useEffect(() => {
      view.current?.dispatch({
        effects: liveCompartment.current.reconfigure(live ? livePreview : []),
      });
    }, [live]);

    const first = useRef(true);
    // biome-ignore lint/correctness/useExhaustiveDependencies: a new state is built only when the note, its read-only flag or line endings change.
    useEffect(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      checkpoints.current.clear();
      view.current?.setState(makeState(initialText));
    }, [docKey, readOnly, lineSeparator]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => view.current?.focus(),
        getText: () => view.current?.state.doc.toString() ?? '',
        getSelection() {
          const state = view.current?.state;
          const range = state?.selection.main;
          if (!state || !range || range.empty) return null;
          return {
            text: state.sliceDoc(range.from, range.to),
            line: state.doc.lineAt(range.from).number,
          };
        },
        setText(text) {
          const current = view.current;
          if (!current) return;
          const { doc, lineBreak } = current.state;
          const range = changedRange(
            doc.sliceString(0, doc.length, '\n'),
            text.replace(LINE_BREAK, '\n'),
          );
          if (!range) return;
          current.dispatch({
            changes: {
              from: range.from,
              to: range.to,
              insert: range.insert.replace(LINE_BREAK, lineBreak),
            },
            annotations: externalChange.of(true),
          });
        },
        checkpoint() {
          const id = nextCheckpoint.current;
          nextCheckpoint.current += 1;
          const length = view.current?.state.doc.length ?? 0;
          checkpoints.current.set(id, ChangeSet.empty(length));
          return id;
        },
        applyToCheckpoint(id, from, to, insert) {
          const current = view.current;
          const since = checkpoints.current.get(id);
          checkpoints.current.delete(id);
          if (!current || !since) return;
          const mappedFrom = since.mapPos(from, -1);
          const mappedTo = Math.max(mappedFrom, since.mapPos(to, 1));
          current.dispatch({
            changes: {
              from: mappedFrom,
              to: mappedTo,
              insert: insert.replace(LINE_BREAK, current.state.lineBreak),
            },
            // Not undoable: undo would remove what the server wrote (e.g. the note's id).
            annotations: [externalChange.of(true), Transaction.addToHistory.of(false)],
          });
        },
        releaseCheckpoint(id) {
          checkpoints.current.delete(id);
        },
        insertAt(position, text) {
          const current = view.current;
          if (!current) return;
          const at = Math.min(position, current.state.doc.length);
          const insert = current.state.toText(text.replace(LINE_BREAK, current.state.lineBreak));
          current.dispatch({
            changes: { from: at, insert },
            selection: { anchor: at + insert.length },
          });
          current.focus();
        },
        goToLine(line) {
          const current = view.current;
          if (!current) return;
          const target = current.state.doc.line(
            Math.max(1, Math.min(line, current.state.doc.lines)),
          );
          current.dispatch({
            selection: { anchor: target.from },
            effects: EditorView.scrollIntoView(target.from, { y: 'start', yMargin: 24 }),
          });
          current.focus();
        },
        openSearch(options) {
          const current = view.current;
          if (!current) return;
          current.focus();
          openSearchPanel(current);
          if (options?.replace)
            current.dom
              .querySelector<HTMLInputElement>('.cm-search input[name="replace"]')
              ?.focus();
        },
      }),
      [],
    );

    const editor = <div ref={host} className={className} data-editor />;
    if (!tools) return editor;
    return (
      <SelectionLayer hub={hub} tools={tools} readOnly={readOnly}>
        {editor}
      </SelectionLayer>
    );
  },
);
