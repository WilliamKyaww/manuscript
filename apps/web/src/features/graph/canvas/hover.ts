/*
 * Adapted from Sigma.js 3.0.3, src/rendering/node-hover.ts (drawDiscNodeHover). Copyright (C)
 * 2013-2025, Alexis Jacomy, Guillaume Plique, Benoît Simard. MIT License; see THIRD_PARTY_NOTICES.md.
 * Modified for Manuscript: the label box takes the theme's surface colour instead of white, so a
 * hovered label stays readable in the dark theme.
 */

import type { Attributes } from 'graphology-types';
import type { NodeHoverDrawingFunction } from 'sigma/rendering';
import type { GraphColours } from './theme';

const PADDING = 2;

export function createHoverDrawer<N extends Attributes, E extends Attributes, G extends Attributes>(
  colours: () => GraphColours,
): NodeHoverDrawingFunction<N, E, G> {
  return (context, data, settings) => {
    const size = settings.labelSize;
    const palette = colours();
    context.font = `${settings.labelWeight} ${size}px ${settings.labelFont}`;
    context.fillStyle = palette.surface;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    context.shadowBlur = 8;
    context.shadowColor = 'rgb(0 0 0 / 0.35)';
    context.beginPath();
    if (typeof data.label === 'string') {
      const boxWidth = Math.round(context.measureText(data.label).width + 5);
      const boxHeight = Math.round(size + 2 * PADDING);
      const radius = Math.max(data.size, size / 2) + PADDING;
      const angle = Math.asin(boxHeight / 2 / radius);
      const dx = Math.sqrt(Math.abs(radius ** 2 - (boxHeight / 2) ** 2));
      context.moveTo(data.x + dx, data.y + boxHeight / 2);
      context.lineTo(data.x + radius + boxWidth, data.y + boxHeight / 2);
      context.lineTo(data.x + radius + boxWidth, data.y - boxHeight / 2);
      context.lineTo(data.x + dx, data.y - boxHeight / 2);
      context.arc(data.x, data.y, radius, angle, -angle);
    } else {
      context.arc(data.x, data.y, data.size + PADDING, 0, Math.PI * 2);
    }
    context.closePath();
    context.fill();
    context.shadowBlur = 0;
    if (typeof data.label === 'string') {
      context.fillStyle = palette.label;
      context.fillText(data.label, data.x + data.size + 3, data.y + size / 3);
    }
  };
}
