import { edgeStyleOf, type GraphNode, type GraphNodeType, type GraphPayload } from '@skb/core';
import { MultiDirectedGraph } from 'graphology';
import { useCallback, useEffect, useRef } from 'react';
import Sigma from 'sigma';
import { EdgeRectangleProgram } from 'sigma/rendering';
import type { EdgeDisplayData, NodeDisplayData } from 'sigma/types';
import { createPatternedEdgeProgram, DASHED, DOTTED } from './edge-programs';
import { createHoverDrawer } from './hover';
import { hashUnit, initialPosition, iterationsFor, placeCommunities, runLayout } from './layout';
import { type GraphColours, readGraphColours, watchTheme } from './theme';

/**
 * The WebGL graph (task 7.08): Sigma on a graphology model, laid out by ForceAtlas2 in a worker.
 * Loaded lazily (Sigma needs WebGL, which tests and some browsers lack); `GraphView` decides
 * whether it can be shown. Colour shows the community (or the node type); line style shows the
 * confidence of an edge; hovering or selecting a node brings its neighbours forward.
 */

export interface GraphCanvasProps {
  payload: GraphPayload;
  colourBy: 'community' | 'type';
  hiddenCommunities: ReadonlySet<number>;
  selected: string | null;
  /** Centre the camera on a node; a new nonce repeats the request for the same node. */
  focus: { id: string; nonce: number } | null;
  /** Nodes to bring forward (a path), instead of the selection's neighbourhood. */
  highlight: ReadonlySet<string> | null;
  onSelect(id: string | null): void;
  /** Smaller graphs on note and concept pages: every label shown. */
  compact?: boolean;
  label: string;
}

interface NodeAttributes {
  x: number;
  y: number;
  size: number;
  label: string;
  kind: GraphNodeType;
  community: number | null;
}

interface EdgeAttributes {
  size: number;
  type: 'solid' | 'dashed' | 'dotted';
}

type Model = MultiDirectedGraph<NodeAttributes, EdgeAttributes>;

const DashedEdgeProgram = createPatternedEdgeProgram<NodeAttributes, EdgeAttributes>(...DASHED);
const DottedEdgeProgram = createPatternedEdgeProgram<NodeAttributes, EdgeAttributes>(...DOTTED);

const STRUCTURAL = new Set<GraphNodeType>(['module', 'lecture', 'topic']);

const TYPE_COLOUR: Record<GraphNodeType, (colours: GraphColours) => string> = {
  concept: (colours) => colours.communities[0] ?? colours.node,
  note: (colours) => colours.communities[2] ?? colours.node,
  source: (colours) => colours.communities[1] ?? colours.node,
  lecture: (colours) => colours.communities[3] ?? colours.node,
  topic: (colours) => colours.communities[4] ?? colours.node,
  module: (colours) => colours.structure,
};

function sizeFor(node: GraphNode, compact: boolean): number {
  const base = compact ? 4 : 3;
  if (STRUCTURAL.has(node.type)) return base + 3 + Math.min(8, Math.sqrt(node.degree));
  return base + Math.min(12, 1.6 * Math.sqrt(node.degree));
}

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export default function GraphCanvas(props: GraphCanvasProps) {
  const { payload, compact, selected, highlight, hiddenCommunities, colourBy, focus } = props;
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const view = useRef<{
    sigma: Sigma<NodeAttributes, EdgeAttributes>;
    model: Model;
    colours: GraphColours;
    hovered: string | null;
    neighbours: Set<string>;
    positions: Map<string, { x: number; y: number }>;
    stopLayout: () => void;
  } | null>(null);

  /** Moves the camera to a node. */
  const centreOn = useCallback((id: string) => {
    const sigma = view.current?.sigma;
    const data = sigma?.getNodeDisplayData(id);
    if (!sigma || !data) return;
    void sigma
      .getCamera()
      .animate({ x: data.x, y: data.y, ratio: 0.6 }, { duration: reducedMotion() ? 0 : 400 });
  }, []);

  // Sigma is created once and fed new payloads below.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const model: Model = new MultiDirectedGraph();
    const colours = readGraphColours();
    const colourOf = (data: NodeAttributes) => {
      const { colourBy } = latest.current;
      const palette = view.current?.colours ?? colours;
      if (colourBy === 'type') return TYPE_COLOUR[data.kind](palette);
      if (data.community !== null)
        return palette.communities[data.community % palette.communities.length] ?? palette.node;
      return STRUCTURAL.has(data.kind) ? palette.structure : palette.node;
    };
    const sigma = new Sigma<NodeAttributes, EdgeAttributes>(model, element, {
      defaultEdgeType: 'solid',
      edgeProgramClasses: {
        solid: EdgeRectangleProgram,
        dashed: DashedEdgeProgram,
        dotted: DottedEdgeProgram,
      },
      labelColor: { color: colours.label },
      labelFont: getComputedStyle(document.body).fontFamily,
      labelSize: 12,
      labelRenderedSizeThreshold: 0,
      defaultDrawNodeHover: createHoverDrawer(() => view.current?.colours ?? colours),
      zIndex: true,
      minCameraRatio: 0.05,
      maxCameraRatio: 4,
      nodeReducer: (node, data): Partial<NodeDisplayData> => {
        const state = view.current;
        const { hiddenCommunities, highlight, selected } = latest.current;
        const palette = state?.colours ?? colours;
        const display: Partial<NodeDisplayData> = { ...data, color: colourOf(data) };
        if (data.community !== null && hiddenCommunities.has(data.community))
          return { ...display, hidden: true };
        const focus = state?.hovered ?? selected;
        const faded = highlight
          ? !highlight.has(node)
          : focus !== null && node !== focus && !state?.neighbours.has(node);
        if (faded) return { ...display, color: palette.edge, label: '', zIndex: 0 };
        if (node === focus || highlight?.has(node))
          return { ...display, highlighted: node === focus, forceLabel: true, zIndex: 2 };
        return focus !== null ? { ...display, forceLabel: true, zIndex: 1 } : display;
      },
      edgeReducer: (edge, data): Partial<EdgeDisplayData> => {
        const state = view.current;
        const { hiddenCommunities, highlight, selected } = latest.current;
        const palette = state?.colours ?? colours;
        const [source, target] = model.extremities(edge);
        const hidden = [source, target].some((node) => {
          const community = model.getNodeAttribute(node, 'community');
          return community !== null && hiddenCommunities.has(community);
        });
        if (hidden) return { ...data, hidden: true };
        const focus = state?.hovered ?? selected;
        const strong = highlight
          ? highlight.has(source) && highlight.has(target)
          : focus !== null && (source === focus || target === focus);
        return {
          ...data,
          color: strong ? palette.edgeStrong : palette.edge,
          size: strong ? data.size + 0.8 : data.size,
          zIndex: strong ? 1 : 0,
        };
      },
    });

    const refreshNeighbours = () => {
      const state = view.current;
      if (!state) return;
      const focus = state.hovered ?? latest.current.selected;
      state.neighbours = new Set(focus && model.hasNode(focus) ? model.neighbors(focus) : []);
    };
    sigma.on('clickNode', ({ node }) => latest.current.onSelect(node));
    sigma.on('clickStage', () => latest.current.onSelect(null));
    sigma.on('enterNode', ({ node }) => {
      if (!view.current) return;
      view.current.hovered = node;
      element.style.cursor = 'pointer';
      refreshNeighbours();
      sigma.refresh({ skipIndexation: true });
    });
    sigma.on('leaveNode', () => {
      if (!view.current) return;
      view.current.hovered = null;
      element.style.cursor = '';
      refreshNeighbours();
      sigma.refresh({ skipIndexation: true });
    });

    view.current = {
      sigma,
      model,
      colours,
      hovered: null,
      neighbours: new Set(),
      positions: new Map(),
      stopLayout: () => undefined,
    };
    const stopWatching = watchTheme(() => {
      if (!view.current) return;
      view.current.colours = readGraphColours();
      sigma.setSetting('labelColor', { color: view.current.colours.label });
      sigma.refresh({ skipIndexation: true });
    });
    const resize = new ResizeObserver(() => sigma.refresh());
    resize.observe(element);
    return () => {
      resize.disconnect();
      stopWatching();
      view.current?.stopLayout();
      view.current = null;
      sigma.kill();
    };
  }, []);

  // A new payload: keep the nodes that remain where they are, place new ones near a neighbour,
  // and let the layout settle them.
  useEffect(() => {
    const state = view.current;
    if (!state) return;
    const { model, positions } = state;
    const wanted = new Set(payload.nodes.map((node) => node.id));
    for (const node of model.nodes()) if (!wanted.has(node)) model.dropNode(node);
    model.clearEdges();
    const neighbourOf = new Map<string, string>();
    for (const edge of payload.edges) {
      neighbourOf.set(edge.source, edge.target);
      neighbourOf.set(edge.target, edge.source);
    }
    const placement = placeCommunities(payload.communities);
    const added: string[] = [];
    for (const node of payload.nodes) {
      const attributes = {
        label: node.label,
        size: sizeFor(node, compact ?? false),
        kind: node.type,
        community: node.community,
      };
      if (model.hasNode(node.id)) {
        model.mergeNodeAttributes(node.id, attributes);
        continue;
      }
      const near = positions.get(neighbourOf.get(node.id) ?? '');
      const start =
        positions.get(node.id) ??
        (near
          ? { x: near.x + hashUnit(node.id) * 2 - 1, y: near.y + hashUnit(`${node.id}:y`) * 2 - 1 }
          : initialPosition(node.id, node.community, placement));
      model.addNode(node.id, { ...attributes, ...start });
      added.push(node.id);
    }
    for (const edge of payload.edges)
      model.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
        size: 0.6 + Math.min(1.5, Math.log2(edge.weight) * 0.5),
        type: edgeStyleOf(edge.confidence),
      });

    // Small graphs show every label; large ones only those of well-connected nodes.
    state.sigma.setSetting(
      'labelRenderedSizeThreshold',
      compact || payload.nodes.length <= 150 ? 0 : 6,
    );
    state.stopLayout();
    const element = container.current;
    if (added.length === 0) return;
    if (element) element.dataset.layout = 'running';
    const order = model.nodes();
    const index = new Map(order.map((node, i) => [node, i]));
    const fresh = added.length === order.length;
    state.stopLayout = runLayout(
      {
        nodes: order.map((node) => ({
          id: node,
          x: model.getNodeAttribute(node, 'x'),
          y: model.getNodeAttribute(node, 'y'),
        })),
        edges: payload.edges.map((edge) => [edge.source, edge.target, edge.weight]),
        iterations: fresh ? iterationsFor(order.length) : 40,
      },
      (coordinates, done) => {
        if (done && element) element.dataset.layout = 'done';
        // A node asked for before the layout settled has moved since: centre on it again.
        if (done) {
          const target = latest.current.focus;
          if (target) requestAnimationFrame(() => centreOn(target.id));
        }
        model.updateEachNodeAttributes(
          (node, attributes) => {
            const i = index.get(node);
            if (i === undefined) return attributes;
            const x = coordinates[i * 2] ?? attributes.x;
            const y = coordinates[i * 2 + 1] ?? attributes.y;
            positions.set(node, { x, y });
            return { ...attributes, x, y };
          },
          { attributes: ['x', 'y'] },
        );
      },
      { reducedMotion: reducedMotion() },
    );
  }, [payload, compact, centreOn]);

  // Selection, highlighting, hidden communities and colouring change only what is drawn.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the reducers read these through `latest`; a change must redraw.
  useEffect(() => {
    const state = view.current;
    if (!state) return;
    const centre = state.hovered ?? selected;
    state.neighbours = new Set(
      centre && state.model.hasNode(centre) ? state.model.neighbors(centre) : [],
    );
    state.sigma.refresh({ skipIndexation: true });
  }, [selected, highlight, hiddenCommunities, colourBy]);

  useEffect(() => {
    if (focus) centreOn(focus.id);
  }, [focus, centreOn]);

  return (
    <div
      ref={container}
      role="img"
      aria-label={props.label}
      data-graph-canvas
      data-layout="done"
      className="relative h-full min-h-0 w-full"
    />
  );
}
