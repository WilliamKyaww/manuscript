import { MASTERY_STAGES, type MasteryStage } from '@skb/core';

/** Graph colours read from the design tokens (tokens.css), which differ by theme. */

export interface GraphColours {
  communities: string[];
  node: string;
  structure: string;
  edge: string;
  edgeStrong: string;
  label: string;
  background: string;
  surface: string;
  /** The mastery overlay's colour for each stage. */
  stages: Record<MasteryStage, string>;
}

export function readGraphColours(element: Element = document.documentElement): GraphColours {
  const style = getComputedStyle(element);
  const token = (name: string, fallback: string) =>
    style.getPropertyValue(`--skb-${name}`).trim() || fallback;
  return {
    communities: Array.from({ length: 10 }, (_, i) => token(`graph-${i + 1}`, '#2f6b5a')),
    node: token('graph-node', '#9c958b'),
    structure: token('graph-structure', '#57514a'),
    edge: token('graph-edge', '#cfc8bc'),
    edgeStrong: token('graph-edge-strong', '#7d766c'),
    label: token('text', '#1f1c18'),
    background: token('bg', '#f7f5f1'),
    surface: token('surface-raised', '#ffffff'),
    stages: Object.fromEntries(
      MASTERY_STAGES.map((stage) => [stage, token(`stage-${stage}`, '#9c958b')]),
    ) as Record<MasteryStage, string>,
  };
}

/** Calls `onChange` whenever the theme (the `data-theme` attribute) changes. */
export function watchTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}
