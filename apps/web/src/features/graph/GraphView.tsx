import { lazy, Suspense, useState } from 'react';
import { LoadingState } from '../../components/States';
import type { GraphCanvasProps } from './canvas/GraphCanvas';

/**
 * The graph canvas when the browser can draw it. Sigma needs WebGL; without it (switched off,
 * or in tests) the page says so and its lists still show the same connections.
 */

const GraphCanvas = lazy(() => import('./canvas/GraphCanvas'));

export function webglAvailable(): boolean {
  if (typeof window === 'undefined' || typeof WebGLRenderingContext === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function GraphView(props: GraphCanvasProps) {
  const [available] = useState(webglAvailable);
  if (!available)
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="max-w-sm text-center text-sm text-muted">
          This browser cannot draw the graph (WebGL is switched off or unavailable). The lists
          beside it show the same connections.
        </p>
      </div>
    );
  return (
    <Suspense fallback={<LoadingState label="Drawing the graph" />}>
      <GraphCanvas {...props} />
    </Suspense>
  );
}
