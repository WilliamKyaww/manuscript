import type { OwnerType, StoredVector } from './repository';

/**
 * Brute-force cosine search over every stored vector (ADR-0010: no vector database until one is
 * needed). Vectors are normalised and kept as 8-bit integers: a quarter of the memory of floats,
 * at a cost in precision far below what changes a ranking of passages. 30,000 vectors of 1,536
 * numbers take about 46 MB.
 */

export interface VectorHit {
  type: OwnerType;
  id: string;
  score: number;
}

export interface VectorIndex {
  readonly size: number;
  readonly dims: number;
  search(query: readonly number[], options: { limit: number; type?: OwnerType }): VectorHit[];
  /** The stored vector of an owner, for "more like this". */
  vectorOf(type: OwnerType, id: string): number[] | null;
}

const SCALE = 127;

function normalised(vector: ArrayLike<number>): Float32Array {
  let norm = 0;
  for (let index = 0; index < vector.length; index += 1) norm += (vector[index] as number) ** 2;
  const length = Math.sqrt(norm) || 1;
  const result = new Float32Array(vector.length);
  for (let index = 0; index < vector.length; index += 1)
    result[index] = (vector[index] as number) / length;
  return result;
}

export function buildVectorIndex(stored: readonly StoredVector[]): VectorIndex {
  const dims = stored[0]?.vector.length ?? 0;
  // Vectors of another length (a model changed mid-way) are left out rather than mis-compared.
  const rows = stored.filter((row) => row.vector.length === dims);
  const data = new Int8Array(rows.length * dims);
  const owners = rows.map((row) => ({ type: row.type, id: row.id }));
  const position = new Map<string, number>();
  rows.forEach((row, index) => {
    const unit = normalised(row.vector);
    for (let d = 0; d < dims; d += 1)
      data[index * dims + d] = Math.round((unit[d] as number) * SCALE);
    position.set(`${row.type}:${row.id}`, index);
  });

  return {
    size: rows.length,
    dims,
    search(query, { limit, type }) {
      if (query.length !== dims || rows.length === 0) return [];
      const unit = normalised(query);
      const hits: VectorHit[] = [];
      let floor = Number.NEGATIVE_INFINITY;
      for (let index = 0; index < owners.length; index += 1) {
        const owner = owners[index] as { type: OwnerType; id: string };
        if (type && owner.type !== type) continue;
        let dot = 0;
        const offset = index * dims;
        for (let d = 0; d < dims; d += 1) dot += (unit[d] as number) * (data[offset + d] as number);
        const score = dot / SCALE;
        if (hits.length < limit || score > floor) {
          hits.push({ type: owner.type, id: owner.id, score });
          if (hits.length > limit) {
            hits.sort((a, b) => b.score - a.score);
            hits.length = limit;
          }
          floor =
            hits.length < limit
              ? Number.NEGATIVE_INFINITY
              : Math.min(...hits.map((hit) => hit.score));
        }
      }
      return hits.sort((a, b) => b.score - a.score);
    },
    vectorOf(type, id) {
      const index = position.get(`${type}:${id}`);
      if (index === undefined) return null;
      return Array.from(data.subarray(index * dims, (index + 1) * dims), (value) => value / SCALE);
    },
  };
}
