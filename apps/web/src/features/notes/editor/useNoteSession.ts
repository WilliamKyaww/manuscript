import { type NoteChange, type NoteDetail, updateNoteEndpoint } from '@skb/core';
import { useQueryClient } from '@tanstack/react-query';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../lib/api/client';
import { useApi } from '../../../lib/api/context';
import { changedRange } from '../../../lib/diff';
import { onServerEvent } from '../../../lib/events';
import { noteQuery, notesKeys, patchTreeNote } from '../api';
import type { MarkdownEditorHandle } from './MarkdownEditor';

/**
 * One open note's editing session (task 3.14): debounced autosave and Ctrl+S, conflict detection
 * and resolution. The rule it enforces: a save is always based on a known version of the file, so
 * an edit made elsewhere is never silently overwritten (architecture.md §6.1).
 */

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'failed';
export type Conflict = { kind: 'changed'; theirHash: string | null } | { kind: 'deleted' } | null;

export interface NoteSession {
  status: SaveStatus;
  conflict: Conflict;
  error: string | null;
  readOnly: boolean;
  /** Text for the editor: without a byte-order mark, line breaks as CodeMirror counts them. */
  editorText: string;
  lineSeparator: '\r\n' | null;
  onEditorChange(text: string): void;
  saveNow(): Promise<void>;
  /** Discards local changes and loads the version on disk. */
  reload(): Promise<void>;
  /** Overwrites the version on disk with the local text (after the user has chosen to). */
  keepMine(): Promise<void>;
  /** The version on disk, for comparison. */
  loadTheirs(): Promise<NoteDetail>;
  /** The local text as it would be saved. */
  currentText(): string;
}

const AUTOSAVE_MS = 1000;
const RETRY_MS = 10_000;
const BOM = '﻿';
const READ_ONLY_WARNINGS = new Set(['not-utf8', 'too-large']);

/** Line breaks counted once each, as in the editor. */
const normalise = (text: string) => text.replace(/\r\n?/g, '\n');

function separatorOf(content: string): '\r\n' | null {
  // Keep Windows line endings only when the file uses them consistently.
  return content.includes('\r\n') && !/(^|[^\r])\n/.test(content) ? '\r\n' : null;
}

export function useNoteSession(
  note: NoteDetail,
  editor: RefObject<MarkdownEditorHandle | null>,
): NoteSession {
  const api = useApi();
  const queryClient = useQueryClient();
  const id = note.id;
  // The format is fixed for the session: it is how the file was when it was opened.
  const [format] = useState(() => ({
    bom: note.content.startsWith(BOM),
    separator: separatorOf(note.content),
  }));
  const toServer = useCallback((text: string) => (format.bom ? BOM : '') + text, [format]);
  const toEditor = useCallback(
    (content: string) => (content.startsWith(BOM) ? content.slice(1) : content),
    [],
  );

  const readOnly = note.warnings.some((warning) => READ_ONLY_WARNINGS.has(warning.code));
  const [editorText] = useState(() => toEditor(note.content));
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [conflict, setConflictState] = useState<Conflict>(null);
  const [error, setError] = useState<string | null>(null);

  const base = useRef({ hash: note.hash, content: note.content });
  const text = useRef(note.content);
  const conflictRef = useRef<Conflict>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const saveAgain = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);

  const setConflict = useCallback((next: Conflict) => {
    conflictRef.current = next;
    if (mounted.current) setConflictState(next);
  }, []);
  const updateStatus = useCallback((next: SaveStatus) => {
    if (mounted.current) setStatus(next);
  }, []);

  const accept = useCallback(
    (detail: NoteDetail) => {
      base.current = { hash: detail.hash, content: detail.content };
      queryClient.setQueryData(notesKeys.note(detail.id), detail);
      patchTreeNote(queryClient, detail);
    },
    [queryClient],
  );

  const save = useCallback(
    async (overwriteHash?: string): Promise<void> => {
      if (readOnly) return;
      if (conflictRef.current && overwriteHash === undefined) return;
      clearTimeout(timer.current);
      if (inFlight.current) {
        saveAgain.current = true;
        return inFlight.current;
      }
      const sent = text.current;
      if (overwriteHash === undefined && sent === base.current.content) {
        updateStatus('saved');
        return;
      }
      const checkpoint = editor.current?.checkpoint();
      updateStatus('saving');
      const request = api
        .request(updateNoteEndpoint, {
          params: { id },
          body: { content: sent, baseHash: overwriteHash ?? base.current.hash },
        })
        .then((detail) => {
          accept(detail);
          setConflict(null);
          if (mounted.current) setError(null);
          // The server may have written something too (an id in the frontmatter): apply it on top
          // of whatever was typed while saving.
          const range = changedRange(
            normalise(toEditor(sent)),
            normalise(toEditor(detail.content)),
          );
          if (range && checkpoint !== undefined) {
            editor.current?.applyToCheckpoint(checkpoint, range.from, range.to, range.insert);
          } else if (checkpoint !== undefined) {
            editor.current?.releaseCheckpoint(checkpoint);
          }
          if (text.current === base.current.content) {
            updateStatus('saved');
          } else {
            updateStatus('unsaved');
            saveAgain.current = true;
          }
        })
        .catch((failure: unknown) => {
          if (checkpoint !== undefined) editor.current?.releaseCheckpoint(checkpoint);
          if (failure instanceof ApiError && failure.status === 409) {
            const details = failure.problem?.details ?? {};
            setConflict(
              details.reason === 'deleted'
                ? { kind: 'deleted' }
                : {
                    kind: 'changed',
                    theirHash: typeof details.currentHash === 'string' ? details.currentHash : null,
                  },
            );
            updateStatus('unsaved');
            return;
          }
          if (mounted.current)
            setError(failure instanceof Error ? failure.message : String(failure));
          updateStatus('failed');
          timer.current = setTimeout(() => void save(), RETRY_MS);
        })
        .finally(() => {
          inFlight.current = null;
          if (saveAgain.current) {
            saveAgain.current = false;
            if (!conflictRef.current) void save();
          }
        });
      inFlight.current = request;
      return request;
    },
    [accept, api, editor, id, readOnly, setConflict, toEditor, updateStatus],
  );

  const onEditorChange = useCallback(
    (editorValue: string) => {
      text.current = toServer(editorValue);
      if (text.current === base.current.content) {
        if (!inFlight.current) updateStatus('saved');
        return;
      }
      updateStatus('unsaved');
      if (conflictRef.current || readOnly) return;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(), AUTOSAVE_MS);
    },
    [readOnly, save, toServer, updateStatus],
  );

  const loadTheirs = useCallback(
    () => queryClient.fetchQuery({ ...noteQuery(api, id), staleTime: 0 }),
    [api, id, queryClient],
  );

  const reload = useCallback(async () => {
    clearTimeout(timer.current);
    const detail = await loadTheirs();
    accept(detail);
    text.current = detail.content;
    editor.current?.setText(toEditor(detail.content));
    setConflict(null);
    updateStatus('saved');
  }, [accept, editor, loadTheirs, setConflict, toEditor, updateStatus]);

  const keepMine = useCallback(async () => {
    const current = conflictRef.current;
    const theirHash =
      current?.kind === 'changed' && current.theirHash
        ? current.theirHash
        : (await loadTheirs()).hash;
    setConflict(null);
    await save(theirHash);
  }, [loadTheirs, save, setConflict]);

  // Edits made elsewhere: reload quietly if nothing is unsaved here, otherwise raise a conflict.
  useEffect(() => {
    const handle = (change: NoteChange) => {
      if (change.id !== id) return;
      if (inFlight.current) {
        // Our own save may announce itself before its reply arrives; decide once it has.
        void inFlight.current.finally(() => handle(change));
        return;
      }
      if (change.kind === 'deleted') {
        setConflict({ kind: 'deleted' });
        return;
      }
      if (change.kind === 'moved')
        void queryClient.invalidateQueries({ queryKey: notesKeys.note(id) });
      if (change.hash === null || change.hash === base.current.hash) return;
      if (text.current === base.current.content && !conflictRef.current) {
        void reload();
      } else {
        setConflict({ kind: 'changed', theirHash: change.hash });
      }
    };
    return onServerEvent((event) => {
      if (event.type === 'vault.changed') for (const change of event.notes) handle(change);
    });
  }, [id, queryClient, reload, setConflict]);

  // Warn before closing the tab with unsaved text, and save it when leaving the note.
  useEffect(() => {
    mounted.current = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (text.current !== base.current.content) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      mounted.current = false;
      window.removeEventListener('beforeunload', beforeUnload);
      clearTimeout(timer.current);
      if (text.current !== base.current.content && !conflictRef.current) void save();
    };
  }, [save]);

  return {
    status,
    conflict,
    error,
    readOnly,
    editorText,
    lineSeparator: format.separator,
    onEditorChange,
    saveNow: () => save(),
    reload,
    keepMine,
    loadTheirs,
    currentText: () => text.current,
  };
}
