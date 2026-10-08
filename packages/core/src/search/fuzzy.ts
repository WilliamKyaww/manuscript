/**
 * Quick-switcher matching (task 4.04): rank notes (later also sources, concepts, modules) by how well
 * a short query matches their name, title or aliases. Exact beats prefix beats word-prefix beats
 * substring beats a fuzzy subsequence; recently opened items get a boost. Case, accents and
 * separators are ignored. Runs in the browser over the whole vault, so it is allocation-light.
 */

export interface SwitcherCandidate {
  id: string;
  /** Primary label (a note's title). */
  title: string;
  /** Other names that should find it (file name, aliases). */
  names: readonly string[];
  /** Shown as context; also matched with a lower weight (e.g. "Modules/COC251"). */
  path: string;
}

export interface SwitcherMatch<C extends SwitcherCandidate = SwitcherCandidate> {
  candidate: C;
  score: number;
  /** The label that matched best. */
  label: string;
  /** Matched character ranges within `label`, [start, end). */
  ranges: [number, number][];
}

export interface RankOptions {
  limit?: number;
  /** Candidate ids, most recent first. */
  recent?: readonly string[];
}

/** Lower case, accents removed, with a map from folded positions back to the original string. */
function fold(text: string): { folded: string; positions: number[] } {
  let folded = '';
  const positions: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const base = (text[index] ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (const char of base) {
      folded += char;
      positions.push(index);
    }
  }
  return { folded, positions };
}

function foldQuery(query: string): string {
  return query.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

const WORD_START = /[\s\-_/.(),:]/;

interface FieldScore {
  score: number;
  ranges: [number, number][];
}

function rangesFor(positions: number[], start: number, length: number): [number, number][] {
  const first = positions[start] ?? 0;
  const last = positions[start + length - 1] ?? first;
  return [[first, last + 1]];
}

/** Scores one label; null when it does not match at all. */
function scoreLabel(query: string, label: string): FieldScore | null {
  const { folded, positions } = fold(label);
  if (folded.length === 0) return null;
  const lengthPenalty = Math.min(folded.length - query.length, 50);
  if (folded === query) return { score: 1000, ranges: [[0, label.length]] };
  if (folded.startsWith(query))
    return { score: 800 - lengthPenalty, ranges: rangesFor(positions, 0, query.length) };
  let at = folded.indexOf(query);
  while (at > 0 && !WORD_START.test(folded[at - 1] ?? '')) at = folded.indexOf(query, at + 1);
  if (at > 0) return { score: 650 - lengthPenalty, ranges: rangesFor(positions, at, query.length) };
  const substring = folded.indexOf(query);
  if (substring >= 0)
    return { score: 450 - lengthPenalty, ranges: rangesFor(positions, substring, query.length) };

  // Fuzzy: every query character in order; reward consecutive runs and word starts.
  const compact = query.replace(/ /g, '');
  let score = 200;
  let previous = -2;
  const matched: number[] = [];
  let from = 0;
  for (const char of compact) {
    const found = folded.indexOf(char, from);
    if (found === -1) return null;
    if (found === previous + 1) score += 8;
    else if (found === 0 || WORD_START.test(folded[found - 1] ?? '')) score += 6;
    else score -= Math.min(found - previous, 10);
    matched.push(found);
    previous = found;
    from = found + 1;
  }
  score -= lengthPenalty / 2;
  if (score <= 0) return null;
  const ranges: [number, number][] = [];
  for (const index of matched) {
    const original = positions[index] ?? 0;
    const last = ranges.at(-1);
    if (last && last[1] === original) last[1] = original + 1;
    else ranges.push([original, original + 1]);
  }
  return { score, ranges };
}

export function rankCandidates<C extends SwitcherCandidate>(
  query: string,
  candidates: readonly C[],
  options: RankOptions = {},
): SwitcherMatch<C>[] {
  const limit = options.limit ?? 50;
  const recentRank = new Map((options.recent ?? []).map((id, index) => [id, index]));
  const folded = foldQuery(query);
  if (folded === '') {
    // No query: recently opened items, most recent first.
    return candidates
      .filter((candidate) => recentRank.has(candidate.id))
      .sort((a, b) => (recentRank.get(a.id) ?? 0) - (recentRank.get(b.id) ?? 0))
      .slice(0, limit)
      .map((candidate) => ({ candidate, score: 0, label: candidate.title, ranges: [] }));
  }

  const results: SwitcherMatch<C>[] = [];
  for (const candidate of candidates) {
    let best: (FieldScore & { label: string }) | null = null;
    const consider = (label: string, weight: number) => {
      const scored = scoreLabel(folded, label);
      if (scored && (!best || scored.score * weight > best.score)) {
        best = { score: scored.score * weight, ranges: scored.ranges, label };
      }
    };
    consider(candidate.title, 1);
    for (const name of candidate.names) consider(name, 0.95);
    if (folded.includes('/')) consider(candidate.path, 0.7);
    if (!best) continue;
    const found: FieldScore & { label: string } = best;
    const recent = recentRank.get(candidate.id);
    const boost = recent === undefined ? 0 : Math.max(0, 60 - recent * 3);
    results.push({
      candidate,
      score: found.score + boost,
      label: found.label,
      ranges: found.ranges,
    });
  }
  return results
    .sort(
      (a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title, 'en-GB'),
    )
    .slice(0, limit);
}
