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

const GOLDEN = 0.618_033_988_75;

/**
 * Where a node starts: around its community's place on a circle (so communities begin apart and
 * the layout settles quickly), or scattered by its id when it has none.
 */
export function initialPosition(id: string, community: number | null): { x: number; y: number } {
  const jitter = hashUnit(id);
  if (community === null) {
    const angle = jitter * Math.PI * 2;
    const radius = 60 + hashUnit(`${id}:r`) * 40;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  }
  const angle = ((community * GOLDEN) % 1) * Math.PI * 2;
  const spread = 8 + hashUnit(`${id}:r`) * 8;
  return {
    x: Math.cos(angle) * 40 + Math.cos(jitter * Math.PI * 2) * spread,
    y: Math.sin(angle) * 40 + Math.sin(jitter * Math.PI * 2) * spread,
  };
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
