import { EVENTS_PATH, type ServerEvent, ServerEventSchema } from '@skb/core';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * Live updates from the server (`/api/events`, server-sent events): edits made in other programs,
 * moves, index progress, source imports and background job progress. Lists refresh themselves; the open editor subscribes for its note.
 */

type Listener = (event: ServerEvent) => void;
const listeners = new Set<Listener>();

/** Subscribes to every server event; returns an unsubscribe function. */
export function onServerEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Delivers an event to subscribers (exported for tests). */
export function dispatchServerEvent(event: ServerEvent): void {
  for (const listener of [...listeners]) listener(event);
}

interface ConnectionState {
  connected: boolean;
  setConnected(connected: boolean): void;
}

export const useServerConnection = create<ConnectionState>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
}));

/** Generic cache maintenance; feature code adds its own reactions through `onServerEvent`. */
export function applyEventToCache(queryClient: QueryClient, event: ServerEvent): void {
  if (event.type === 'hello') {
    // After a (re)connection anything may have changed while we were not listening.
    void queryClient.invalidateQueries({ queryKey: ['notes'] });
    return;
  }
  if (event.type === 'index.status') {
    if (event.status.state === 'ready')
      void queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] });
    return;
  }
  if (event.type === 'sources.changed') {
    void queryClient.invalidateQueries({ queryKey: ['sources'] });
    return;
  }
  // Job progress is shown by the features that started the job (through onServerEvent).
  if (event.type === 'job.updated') return;
  const external = event.notes.some((change) => change.origin === 'external');
  if (event.structure || external)
    void queryClient.invalidateQueries({ queryKey: ['notes', 'tree'] });
  void queryClient.invalidateQueries({ queryKey: ['notes', 'backlinks'] });
  void queryClient.invalidateQueries({ queryKey: ['notes', 'mentions'] });
  void queryClient.invalidateQueries({ queryKey: ['notes', 'tags'] });
  void queryClient.invalidateQueries({ queryKey: ['notes', 'templates'] });
  for (const change of event.notes) {
    // The open editor decides for itself; elsewhere a cached copy is simply out of date.
    if (change.origin === 'external' || change.kind !== 'updated') {
      void queryClient.invalidateQueries({
        queryKey: ['notes', 'note', change.id],
        refetchType: 'none',
      });
    }
  }
}

/** Opens the event stream for the lifetime of the signed-in shell. */
export function useServerEvents(): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(EVENTS_PATH);
    const { setConnected } = useServerConnection.getState();
    const handle = (message: MessageEvent<string>) => {
      let parsed: ServerEvent;
      try {
        parsed = ServerEventSchema.parse(JSON.parse(message.data));
      } catch {
        return;
      }
      applyEventToCache(queryClient, parsed);
      dispatchServerEvent(parsed);
    };
    for (const type of [
      'hello',
      'vault.changed',
      'index.status',
      'sources.changed',
      'job.updated',
    ] as const) {
      source.addEventListener(type, handle);
    }
    source.onopen = () => setConnected(true);
    // EventSource reconnects by itself; the 'hello' after reconnecting refreshes everything.
    source.onerror = () => setConnected(false);
    return () => {
      source.close();
      setConnected(false);
    };
  }, [queryClient]);
}
