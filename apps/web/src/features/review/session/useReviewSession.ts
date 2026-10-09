import type { ReviewItem, ReviewRating, SessionSummary } from '@skb/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { notifyError } from '../../../lib/notify';
import { type QueueFilter, useCardActions, useSessionCalls } from '../api';

/**
 * A review session's state (task 8.09): it starts a session, works through its own copy of the
 * queue, asks the server again when that runs out (learning faces come back that way), and ends
 * with a summary. Every action waits for the server, so what is shown is what was saved.
 */

export type SessionPhase = 'starting' | 'reviewing' | 'finished' | 'failed';

export interface ReviewSessionState {
  phase: SessionPhase;
  current: ReviewItem | null;
  revealed: boolean;
  left: number;
  done: number;
  busy: boolean;
  summary: SessionSummary | null;
  /** When nothing is left now, the next learning face (if any). */
  nextDue: string | null;
}

export function useReviewSession(filter: QueueFilter) {
  const calls = useSessionCalls();
  const cardActions = useCardActions();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [phase, setPhase] = useState<SessionPhase>('starting');
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [nextDue, setNextDue] = useState<string | null>(null);
  const shownAt = useRef(Date.now());
  const { set, module } = filter;

  const finish = useCallback(
    async (id: string) => {
      setSummary(await calls.end(id));
      setPhase('finished');
    },
    [calls],
  );

  /** Takes the next batch from the server, or ends the session when nothing is due. */
  const refill = useCallback(
    async (id: string) => {
      const queue = await calls.queue({ set, module });
      setNextDue(queue.nextDue);
      if (queue.items.length > 0) {
        setItems(queue.items);
        setPhase('reviewing');
      } else {
        setItems([]);
        await finish(id);
      }
    },
    [calls, set, module, finish],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: one session per filter, started on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await calls.start({ set, module });
        if (cancelled) return;
        setSessionId(session.id);
        await refill(session.id);
      } catch (error) {
        notifyError(error);
        setPhase('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [set, module]);

  const current = items[0] ?? null;
  useEffect(() => {
    if (current) shownAt.current = Date.now();
  }, [current]);

  const run = async (action: () => Promise<void>) => {
    if (busy || !sessionId) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      notifyError(error);
    } finally {
      setBusy(false);
    }
  };

  /** Drops faces from the local queue, refilling when it empties. */
  const drop = async (keep: (item: ReviewItem) => boolean) => {
    const rest = items.filter(keep);
    setRevealed(false);
    if (rest.length > 0) setItems(rest);
    else if (sessionId) await refill(sessionId);
  };

  return {
    state: {
      phase,
      current,
      revealed,
      left: items.length,
      done,
      busy,
      summary,
      nextDue,
    } satisfies ReviewSessionState,
    reveal: () => {
      if (current && !revealed) setRevealed(true);
    },
    rate: (rating: ReviewRating) =>
      run(async () => {
        if (!current || !revealed || !sessionId) return;
        await calls.rate({
          cardId: current.cardId,
          ordinal: current.ordinal,
          rating,
          durationMs: Math.min(Date.now() - shownAt.current, 86_400_000),
          sessionId,
        });
        setDone((value) => value + 1);
        await drop((item) => item !== current);
      }),
    undo: () =>
      run(async () => {
        if (!sessionId) return;
        const { item } = await calls.undo(sessionId);
        setItems((list) => [
          item,
          ...list.filter(
            (other) => !(other.cardId === item.cardId && other.ordinal === item.ordinal),
          ),
        ]);
        setDone((value) => Math.max(0, value - 1));
        setRevealed(false);
        setSummary(null);
        setPhase('reviewing');
      }),
    bury: () =>
      run(async () => {
        if (!current) return;
        await calls.bury(current.cardId, current.ordinal);
        await drop((item) => item !== current);
      }),
    suspend: () =>
      run(async () => {
        if (!current) return;
        await cardActions.updateCard.mutateAsync({ id: current.cardId, status: 'suspended' });
        await drop((item) => item.cardId !== current.cardId);
      }),
    /** After an edit: the faces are shown again as they now read. */
    reload: () =>
      run(async () => {
        if (sessionId) await refill(sessionId);
        setRevealed(false);
      }),
    end: () =>
      run(async () => {
        if (sessionId) await finish(sessionId);
      }),
  };
}
