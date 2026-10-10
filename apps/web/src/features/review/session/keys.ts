import { RATING_LABELS } from '@skb/core';

/** The review session's keys: the session acts on them, and the shortcuts cheat sheet lists them. */

export type ReviewKey =
  | 'reveal'
  | 'reveal-enter'
  | 'rate-1'
  | 'rate-2'
  | 'rate-3'
  | 'rate-4'
  | 'undo'
  | 'edit'
  | 'suspend'
  | 'bury'
  | 'source'
  | 'focus';

export const REVIEW_KEYS: Record<ReviewKey, { keys: string; description: string }> = {
  reveal: { keys: 'space', description: 'Show the answer' },
  'reveal-enter': { keys: 'enter', description: 'Show the answer' },
  'rate-1': { keys: '1', description: `Rate ${RATING_LABELS[1]}` },
  'rate-2': { keys: '2', description: `Rate ${RATING_LABELS[2]}` },
  'rate-3': { keys: '3', description: `Rate ${RATING_LABELS[3]}` },
  'rate-4': { keys: '4', description: `Rate ${RATING_LABELS[4]}` },
  undo: { keys: 'mod+z', description: 'Undo the last rating' },
  edit: { keys: 'e', description: 'Edit the card' },
  suspend: { keys: 's', description: 'Suspend the card' },
  bury: { keys: 'b', description: 'Bury until tomorrow' },
  source: { keys: 'o', description: 'Open the source' },
  focus: { keys: 'f', description: 'Focus mode' },
};
