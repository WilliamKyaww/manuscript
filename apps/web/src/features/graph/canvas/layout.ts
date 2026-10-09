import type { LayoutProgress, LayoutRequest } from './layout.worker';

/** Starting positions and the layout worker's driver. */

/** FNV-1a hash of a string to [0, 1): the same id always lands in the same place. */
export function hashUnit(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 4_294_967_296;
}

/** The golden angle: points placed this far apart round a spiral never line up. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface Placement {
  /** Where each community starts, and how far its members spread. */
  centres: Map<number, { x: number; y: number; spread: number }>;
  /** Radius beyond which nodes without a community start. */
  outer: number;
}

/**
 * Community starting places on a sunflower spiral, largest in the middle, each given room in
 * proportion to its size, so clusters begin apart and the layout only has to refine them.
 */
export function placeCommunities(communities: readonly { id: number; size: number }[]): Placement {
  const centres = new Map<number, { x: number; y: number; spread: number }>();
  const largest = Math.max(1, ...communities.map((community) => community.size));
  const step = 2.4 * Math.sqrt(largest) + 6;
  communities.forEach((community, rank) => {
    const radius = step * Math.sqrt(rank);
    const angle = rank * GOLDEN_ANGLE;
    centres.set(community.id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      spread: 1.2 * Math.sqrt(community.size) + 1,
    });
  });
  return { centres, outer: step * Math.sqrt(communities.length) + step };
}

/**
 * Where a node starts: inside its community's place, or on a ring outside them all when it has no
 * community. The same id always starts in the same place.
 */
export function initialPosition(
  id: string,
  community: number | null,
  placement: Placement,
): { x: number; y: number } {
  const angle = hashUnit(id) * Math.PI * 2;
  const centre = community === null ? undefined : placement.centres.get(community);
  if (!centre) {
    const radius = placement.outer * (1 + hashUnit(`${id}:r`) * 0.3);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  }
  const distance = centre.spread * Math.sqrt(hashUnit(`${id}:r`));
  return { x: centre.x + Math.cos(angle) * distance, y: centre.y + Math.sin(angle) * distance };
}

/** Fewer iterations for big graphs: they take longer each and settle well enough. */
export function iterationsFor(order: number): number {
  if (order <= 300) return 300;
  if (order <= 2_000) return 180;
  return 100;
}

/**
 * Runs a layout in a fresh worker, calling `onPositions` as it settles (or only at the end when
 * motion is reduced). Returns a function that stops it.
 */
export function runLayout(
  request: LayoutRequest,
  onPositions: (positions: Float32Array, done: boolean) => void,
  options: { reducedMotion: boolean },
): () => void {
  if (typeof Worker === 'undefined' || request.nodes.length === 0) return () => undefined;
  const worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<LayoutProgress>) => {
    if (options.reducedMotion && !event.data.done) return;
    onPositions(event.data.positions, event.data.done);
    if (event.data.done) worker.terminate();
  };
  worker.postMessage(request);
  return () => worker.terminate();
}
