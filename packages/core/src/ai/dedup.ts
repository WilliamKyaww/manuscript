/*
 * Concept de-duplication guards, following Graphify's entity de-duplication (`graphify/dedup.py`;
 * release 0.9.75, https://github.com/Graphify-Labs/graphify, Apache License 2.0): names are compared
 * after normalisation, then by Jaro–Winkler similarity behind guards — differing numbers ("Lecture 3"
 * and "Lecture 4"), very short labels, and words that differ only by a prefix are never merged.
 * Modified: translated to TypeScript, without MinHash (concept lists are small enough to compare
 * directly), with thresholds of our own and an explicit "maybe" band for a model to decide. See
 * THIRD_PARTY_NOTICES.md.
 */

/** Lower case, unaccented composition, no possessives, punctuation as spaces, one space between words. */
export function normaliseConceptName(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]s\b/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^(the|a|an) /u, '');
}

/**
 * The forms a name may take: as written, and with plural "s" endings dropped — only after a
 * consonant or "e" ("theorems", "notes"), so that "Paxos", "analysis" and "process" keep theirs.
 */
function forms(name: string): string[] {
  const base = normaliseConceptName(name);
  const singular = base
    .split(' ')
    .map((word) => word.replace(/^(\p{L}{2,}[^aiosu\P{L}])s$/u, '$1'))
    .join(' ');
  return singular === base ? [base] : [base, singular];
}

/** Jaro–Winkler similarity in [0, 1] (prefix scale 0.1, prefix up to 4). */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const matchedA = new Array<boolean>(a.length).fill(false);
  const matchedB = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const from = Math.max(0, i - window);
    const to = Math.min(b.length - 1, i + window);
    for (let j = from; j <= to; j += 1) {
      if (matchedB[j] || a[i] !== b[j]) continue;
      matchedA[i] = true;
      matchedB[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!matchedA[i]) continue;
    while (!matchedB[k]) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }
  const jaro =
    (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix += 1;
  return jaro + prefix * 0.1 * (1 - jaro);
}

const numbers = (text: string) => (text.match(/\p{N}+/gu) ?? []).join(' ');

/** Reasons two different names must not be treated as the same concept, whatever their score. */
function guarded(a: string, b: string): boolean {
  if (numbers(a) !== numbers(b)) return true;
  if (Math.min(a.length, b.length) <= 4) return true;
  // "Paxos" and "Multi-Paxos", "commit" and "two-phase commit": one is a word of the other.
  const wordsA = a.split(' ');
  const wordsB = b.split(' ');
  if (wordsA.length !== wordsB.length) {
    const [short, long] = wordsA.length < wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];
    if (short.every((word) => long.includes(word))) return true;
  }
  return false;
}

export const DEDUP = {
  /** At or above: the same concept written differently. */
  same: 0.94,
  /** From here up to `same`: perhaps the same — worth a model's (or the student's) judgement. */
  maybe: 0.88,
} as const;

export interface NamedConcept {
  id: string;
  names: readonly string[];
}

export type DuplicateMatch =
  | { kind: 'exact'; id: string; name: string }
  | { kind: 'similar' | 'maybe'; id: string; name: string; score: number };

/** The existing concept a name (or one of its aliases) duplicates, if any. */
export function findDuplicate(
  names: readonly string[],
  existing: readonly NamedConcept[],
): DuplicateMatch | null {
  const candidates = names.flatMap(forms);
  let best: Extract<DuplicateMatch, { kind: 'similar' | 'maybe' }> | null = null;
  for (const concept of existing) {
    for (const name of concept.names) {
      const theirs = forms(name);
      if (candidates.some((form) => theirs.includes(form)))
        return { kind: 'exact', id: concept.id, name: concept.names[0] ?? name };
      for (const mine of candidates)
        for (const other of theirs) {
          if (guarded(mine, other)) continue;
          const score = jaroWinkler(mine, other);
          if (score < DEDUP.maybe) continue;
          if (!best || score > best.score)
            best = {
              kind: score >= DEDUP.same ? 'similar' : 'maybe',
              id: concept.id,
              name: concept.names[0] ?? name,
              score,
            };
        }
    }
  }
  return best;
}
