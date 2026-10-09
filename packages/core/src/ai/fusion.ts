/**
 * Reciprocal Rank Fusion (Cormack, Clarke and Büttcher, 2009): each list contributes
 * 1 / (k + rank) for every item it ranks, so items several retrievers agree on rise, and no list's
 * raw scores need to be comparable with another's (ADR-0010). k = 60 is the paper's constant.
 */
export const RRF_K = 60;

export interface Fused<T> {
  item: T;
  score: number;
}

export function reciprocalRankFusion<T>(
  lists: readonly { items: readonly T[]; weight?: number }[],
  key: (item: T) => string,
  k = RRF_K,
): Fused<T>[] {
  const scores = new Map<string, Fused<T>>();
  for (const list of lists) {
    const weight = list.weight ?? 1;
    list.items.forEach((item, index) => {
      const id = key(item);
      const entry = scores.get(id) ?? { item, score: 0 };
      entry.score += weight / (k + index + 1);
      scores.set(id, entry);
    });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score);
}

/** Cosine similarity of two vectors of the same length (0 when either is all zeros). */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const x = a[index] as number;
    const y = b[index] as number;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}
