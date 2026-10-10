import type { GraphEdge, GraphNode } from '../api/graph';

/**
 * The graph in open formats (task 16.04): JSON in the node-link shape NetworkX, D3 and Graphify use,
 * and GraphML for Gephi, yEd and Cytoscape. Pure: the same graph gives the same bytes.
 */

export interface ExportableGraph {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
}

export function toNodeLinkJson(graph: ExportableGraph, meta: Record<string, unknown> = {}): string {
  return `${JSON.stringify(
    {
      directed: true,
      multigraph: true,
      graph: { name: 'Manuscript knowledge graph', ...meta },
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        type: node.type,
        community: node.community,
        modules: node.modules,
        path: node.path,
        mastery: node.mastery ?? null,
      })),
      links: graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        relation: edge.relation,
        kind: edge.kind,
        confidence: edge.confidence,
        status: edge.status,
        score: edge.score,
        weight: edge.weight,
      })),
    },
    null,
    2,
  )}\n`;
}

const escapeXml = (text: string) =>
  text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    // Control characters are not allowed in XML 1.0.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu, '');

export function toGraphMl(graph: ExportableGraph): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
    '  <key id="label" for="node" attr.name="label" attr.type="string"/>',
    '  <key id="type" for="node" attr.name="type" attr.type="string"/>',
    '  <key id="community" for="node" attr.name="community" attr.type="int"/>',
    '  <key id="modules" for="node" attr.name="modules" attr.type="string"/>',
    '  <key id="path" for="node" attr.name="path" attr.type="string"/>',
    '  <key id="relation" for="edge" attr.name="relation" attr.type="string"/>',
    '  <key id="kind" for="edge" attr.name="kind" attr.type="string"/>',
    '  <key id="confidence" for="edge" attr.name="confidence" attr.type="string"/>',
    '  <key id="status" for="edge" attr.name="status" attr.type="string"/>',
    '  <key id="score" for="edge" attr.name="score" attr.type="double"/>',
    '  <key id="weight" for="edge" attr.name="weight" attr.type="double"/>',
    '  <graph id="manuscript" edgedefault="directed">',
  ];
  for (const node of graph.nodes) {
    lines.push(`    <node id="${escapeXml(node.id)}">`);
    lines.push(`      <data key="label">${escapeXml(node.label)}</data>`);
    lines.push(`      <data key="type">${node.type}</data>`);
    if (node.community !== null) lines.push(`      <data key="community">${node.community}</data>`);
    if (node.modules.length > 0)
      lines.push(`      <data key="modules">${escapeXml(node.modules.join(', '))}</data>`);
    if (node.path) lines.push(`      <data key="path">${escapeXml(node.path)}</data>`);
    lines.push('    </node>');
  }
  for (const edge of graph.edges) {
    lines.push(
      `    <edge id="${escapeXml(edge.id)}" source="${escapeXml(edge.source)}" target="${escapeXml(edge.target)}">`,
    );
    lines.push(`      <data key="relation">${edge.relation}</data>`);
    lines.push(`      <data key="kind">${edge.kind}</data>`);
    lines.push(`      <data key="confidence">${edge.confidence}</data>`);
    lines.push(`      <data key="status">${edge.status}</data>`);
    if (edge.score !== null) lines.push(`      <data key="score">${edge.score}</data>`);
    lines.push(`      <data key="weight">${edge.weight}</data>`);
    lines.push('    </edge>');
  }
  lines.push('  </graph>', '</graphml>');
  return `${lines.join('\n')}\n`;
}
