import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { selectActiveNoteId, useWorkspace } from './workspace-store';

/**
 * Keeps the address and the active tab in step (task 23.04). Arriving at `/notes/<id>` (a link, the
 * quick switcher, Back) shows that note in the active tab; changing tab, closing one or focusing the
 * other pane changes the address. Arriving at `/notes` returns to the tab that was open.
 */
export function useRouteSync(routeNoteId: string | undefined): void {
  const navigate = useNavigate();
  const activeNoteId = useWorkspace(selectActiveNoteId);
  const route = useRef(routeNoteId);
  route.current = routeNoteId;

  useEffect(() => {
    if (routeNoteId) {
      useWorkspace.getState().show(routeNoteId);
      return;
    }
    const active = selectActiveNoteId(useWorkspace.getState());
    if (active) void navigate({ to: '/notes/$noteId', params: { noteId: active }, replace: true });
  }, [routeNoteId, navigate]);

  const mounted = useRef(false);
  useEffect(() => {
    // On arrival the address decides (above); after that, changes of tab move the address.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (activeNoteId === (route.current ?? null)) return;
    void navigate(
      activeNoteId ? { to: '/notes/$noteId', params: { noteId: activeNoteId } } : { to: '/notes' },
    );
  }, [activeNoteId, navigate]);
}
