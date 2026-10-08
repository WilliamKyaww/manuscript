/**
 * Small text-diff helpers: the single changed range between two strings (used to update the editor
 * without losing the cursor or undo history) and a line diff (Myers' O(ND) algorithm) for showing
 * two versions of a note side by side.
 */

export interface ChangedRange {
  /** Start of the change in both strings. */
  from: number;
  /** End of the replaced part in the old string. */
  to: number;
  /** Text that replaces `old.slice(from, to)`. */
  insert: string;
}

/** The smallest single replacement turning `before` into `after`, or null if they are equal. */
export function changedRange(before: string, after: string): ChangedRange | null {
  if (before === after) return null;
  let start = 0;
  const shortest = Math.min(before.length, after.length);
  while (start < shortest && before.charCodeAt(start) === after.charCodeAt(start)) start += 1;
  let endBefore = before.length;
  let endAfter = after.length;
  while (
    endBefore > start &&
    endAfter > start &&
    before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)
  ) {
    endBefore -= 1;
    endAfter -= 1;
  }
  return { from: start, to: endBefore, insert: after.slice(start, endAfter) };
}

export interface DiffLine {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

/** Above this many edits the diff falls back to "everything changed" rather than using lots of memory. */
const MAX_EDIT_DISTANCE = 4000;

function splitLines(text: string): string[] {
  return text.length === 0 ? [] : text.replace(/\r\n/g, '\n').split('\n');
}

export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  let found = false;

  for (let d = 0; d <= Math.min(max, MAX_EDIT_DISTANCE) && !found; d += 1) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && (v[k - 1 + offset] ?? 0) < (v[k + 1 + offset] ?? 0));
      let x = down ? (v[k + 1 + offset] ?? 0) : (v[k - 1 + offset] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[k + offset] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }

  if (!found) {
    return [
      ...a.map((text) => ({ kind: 'removed' as const, text })),
      ...b.map((text) => ({ kind: 'added' as const, text })),
    ];
  }

  const result: DiffLine[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d -= 1) {
    const state = trace[d] ?? v;
    const k = x - y;
    const down =
      k === -d || (k !== d && (state[k - 1 + offset] ?? 0) < (state[k + 1 + offset] ?? 0));
    const previousK = down ? k + 1 : k - 1;
    const previousX = state[previousK + offset] ?? 0;
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      result.push({ kind: 'same', text: a[x - 1] ?? '' });
      x -= 1;
      y -= 1;
    }
    if (d > 0) {
      if (x === previousX) result.push({ kind: 'added', text: b[y - 1] ?? '' });
      else result.push({ kind: 'removed', text: a[x - 1] ?? '' });
    }
    x = previousX;
    y = previousY;
  }
  return result.reverse();
}
