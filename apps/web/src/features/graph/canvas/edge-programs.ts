/*
 * Adapted from Sigma.js 3.0.3, src/rendering/programs/edge-rectangle (EdgeRectangleProgram and its
 * shaders). Copyright (C) 2013-2025, Alexis Jacomy, Guillaume Plique, Benoît Simard. MIT License;
 * see THIRD_PARTY_NOTICES.md.
 * Modified for Manuscript: the vertex shader also measures how far along the edge each fragment is,
 * in screen pixels, and the fragment shader leaves gaps, giving dashed and dotted edges (ui.md §7:
 * graph confidence is never shown by colour alone).
 */

import type { Attributes } from 'graphology-types';
import { EdgeProgram, type ProgramInfo } from 'sigma/rendering';
import type { EdgeDisplayData, NodeDisplayData, RenderParams } from 'sigma/types';
import { floatColor } from 'sigma/utils';

const VERTEX_SHADER = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_color;
attribute vec2 a_normal;
attribute float a_normalCoef;
attribute vec2 a_positionStart;
attribute vec2 a_positionEnd;
attribute float a_positionCoef;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_zoomRatio;
uniform float u_pixelRatio;
uniform float u_correctionRatio;
uniform float u_minEdgeThickness;
uniform float u_feather;
uniform vec2 u_resolution;

varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;
varying float v_distance;

const float bias = 255.0 / 254.0;

void main() {
  vec2 normal = a_normal * a_normalCoef;
  vec2 position = a_positionStart * (1.0 - a_positionCoef) + a_positionEnd * a_positionCoef;
  float normalLength = length(normal);
  vec2 unitNormal = normal / normalLength;
  float pixelsThickness = max(normalLength, u_minEdgeThickness * u_sizeRatio);
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;
  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness, 1)).xy, 0, 1);

  // Length of the edge on screen: clip space spans two units across the canvas.
  vec2 start = (u_matrix * vec3(a_positionStart, 1)).xy;
  vec2 end = (u_matrix * vec3(a_positionEnd, 1)).xy;
  v_distance = a_positionCoef * length((end - start) * u_resolution * 0.5);

  v_thickness = webGLThickness / u_zoomRatio;
  v_normal = unitNormal;
  v_feather = u_feather * u_correctionRatio / u_zoomRatio / u_pixelRatio * 2.0;

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = a_color;
  #endif
  v_color.a *= bias;
}
`;

const FRAGMENT_SHADER = /* glsl */ `
precision mediump float;

varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;
varying float v_distance;

uniform vec2 u_dash;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  #ifdef PICKING_MODE
  // Gaps still count when pointing at an edge.
  gl_FragColor = v_color;
  #else
  if (mod(v_distance, u_dash.x + u_dash.y) > u_dash.x) discard;
  float dist = length(v_normal) * v_thickness;
  float t = smoothstep(v_thickness - v_feather, v_thickness, dist);
  gl_FragColor = mix(v_color, transparent, t);
  #endif
}
`;

const UNIFORMS = [
  'u_matrix',
  'u_zoomRatio',
  'u_sizeRatio',
  'u_correctionRatio',
  'u_pixelRatio',
  'u_feather',
  'u_minEdgeThickness',
  'u_resolution',
  'u_dash',
] as const;
type Uniform = (typeof UNIFORMS)[number];

/** An edge program drawing `dash` pixels of line, then `gap` pixels of nothing. */
export function createPatternedEdgeProgram<
  N extends Attributes = Attributes,
  E extends Attributes = Attributes,
  G extends Attributes = Attributes,
>(dash: number, gap: number) {
  const { UNSIGNED_BYTE, FLOAT } = WebGLRenderingContext;
  return class PatternedEdgeProgram extends EdgeProgram<Uniform, N, E, G> {
    getDefinition() {
      return {
        VERTICES: 6,
        VERTEX_SHADER_SOURCE: VERTEX_SHADER,
        FRAGMENT_SHADER_SOURCE: FRAGMENT_SHADER,
        METHOD: WebGLRenderingContext.TRIANGLES,
        UNIFORMS,
        ATTRIBUTES: [
          { name: 'a_positionStart', size: 2, type: FLOAT },
          { name: 'a_positionEnd', size: 2, type: FLOAT },
          { name: 'a_normal', size: 2, type: FLOAT },
          { name: 'a_color', size: 4, type: UNSIGNED_BYTE, normalized: true },
          { name: 'a_id', size: 4, type: UNSIGNED_BYTE, normalized: true },
        ],
        CONSTANT_ATTRIBUTES: [
          { name: 'a_positionCoef', size: 1, type: FLOAT },
          { name: 'a_normalCoef', size: 1, type: FLOAT },
        ],
        CONSTANT_DATA: [
          [0, 1],
          [0, -1],
          [1, 1],
          [1, 1],
          [0, -1],
          [1, -1],
        ],
      };
    }

    processVisibleItem(
      edgeIndex: number,
      startIndex: number,
      sourceData: NodeDisplayData,
      targetData: NodeDisplayData,
      data: EdgeDisplayData,
    ) {
      const thickness = data.size || 1;
      const dx = targetData.x - sourceData.x;
      const dy = targetData.y - sourceData.y;
      const squared = dx * dx + dy * dy;
      let n1 = 0;
      let n2 = 0;
      if (squared) {
        const inverse = 1 / Math.sqrt(squared);
        n1 = -dy * inverse * thickness;
        n2 = dx * inverse * thickness;
      }
      const array = this.array;
      let index = startIndex;
      array[index++] = sourceData.x;
      array[index++] = sourceData.y;
      array[index++] = targetData.x;
      array[index++] = targetData.y;
      array[index++] = n1;
      array[index++] = n2;
      array[index++] = floatColor(data.color);
      array[index++] = edgeIndex;
    }

    setUniforms(params: RenderParams, { gl, uniformLocations }: ProgramInfo<Uniform>) {
      gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
      gl.uniform1f(uniformLocations.u_zoomRatio, params.zoomRatio);
      gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
      gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
      gl.uniform1f(uniformLocations.u_pixelRatio, params.pixelRatio);
      gl.uniform1f(uniformLocations.u_feather, params.antiAliasingFeather);
      gl.uniform1f(uniformLocations.u_minEdgeThickness, params.minEdgeThickness);
      gl.uniform2f(uniformLocations.u_resolution, params.width, params.height);
      gl.uniform2f(uniformLocations.u_dash, dash, gap);
    }
  };
}

/** Line and gap lengths in pixels: dashes for INFERRED relations, dots for AMBIGUOUS ones. */
export const DASHED = [6, 4] as const;
export const DOTTED = [2, 3] as const;
