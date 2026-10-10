import type { GraphEdge } from '../api/graph';
import { sanitiseFileName } from '../markdown/names';
import { EDGE_RELATION_LABELS } from './vocabulary';

/**
 * Concepts as Markdown notes (task 16.03): the same knowledge written the way the student's own notes
 * are, so it can be read, searched and linked in any editor. Pure: concepts and relations in, files
 * out. The wiki-links use the concept's name, which is also the note's name, so they resolve
 * wherever the notes go.
 */

export interface ConceptForNote {
  id: string;
  name: string;
  summary: string;
  aliases: readonly string[];
  /** Module codes, e.g. `COC251`. */
  modules: readonly string[];
}

export interface ConceptNoteFile {
  conceptId: string;
  /** Vault-relative, `/`-separated. */
  path: string;
  content: string;
}

const yamlString = (value: string) => JSON.stringify(value);
const yamlList = (values: readonly string[]) => `[${values.map(yamlString).join(', ')}]`;

export function conceptNotes(
  concepts: readonly ConceptForNote[],
  edges: readonly Pick<GraphEdge, 'source' | 'target' | 'relation' | 'kind' | 'status'>[],
  folder = 'Concepts',
): ConceptNoteFile[] {
  const byId = new Map(concepts.map((concept) => [concept.id, concept]));
  // Names that cannot be a file name as they are, and two concepts that would share one.
  const taken = new Set<string>();
  const stems = new Map<string, string>();
  for (const concept of [...concepts].sort((a, b) => a.name.localeCompare(b.name))) {
    const base = sanitiseFileName(concept.name);
    let stem = base;
    for (let n = 2; taken.has(stem.toLowerCase()); n += 1) stem = `${base} ${n}`;
    taken.add(stem.toLowerCase());
    stems.set(concept.id, stem);
  }
  const link = (concept: ConceptForNote) => {
    const stem = stems.get(concept.id) as string;
    return stem === concept.name ? `[[${stem}]]` : `[[${stem}|${concept.name}]]`;
  };

  const related = new Map<string, { text: string; target: ConceptForNote }[]>();
  for (const edge of edges) {
    if (edge.kind !== 'relation' || edge.status !== 'accepted') continue;
    const from = byId.get(edge.source);
    const to = byId.get(edge.target);
    if (!from || !to || from.id === to.id) continue;
    const labels = EDGE_RELATION_LABELS[edge.relation];
    const add = (owner: ConceptForNote, text: string, target: ConceptForNote) => {
      const list = related.get(owner.id) ?? [];
      list.push({ text, target });
      related.set(owner.id, list);
    };
    add(from, labels.label, to);
    // A symmetric relation reads the same from both ends.
    add(to, labels.label === labels.inverseLabel ? labels.label : labels.inverseLabel, from);
  }

  const prefix = folder === '' ? '' : `${folder.replace(/\/+$/u, '')}/`;
  return [...concepts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((concept) => {
      const stem = stems.get(concept.id) as string;
      const head = ['---', 'type: concept'];
      if (stem !== concept.name) head.push(`title: ${yamlString(concept.name)}`);
      if (concept.aliases.length > 0) head.push(`aliases: ${yamlList(concept.aliases)}`);
      if (concept.modules.length > 0) head.push(`modules: ${yamlList(concept.modules)}`);
      head.push('tags: [concept]', '---');
      const lines = [...head, '', `# ${concept.name}`, ''];
      if (concept.summary.trim() !== '') lines.push(concept.summary.trim(), '');
      const mine = (related.get(concept.id) ?? [])
        .slice()
        .sort((a, b) => a.text.localeCompare(b.text) || a.target.name.localeCompare(b.target.name));
      if (mine.length > 0) {
        lines.push('## Related', '');
        for (const entry of mine) lines.push(`- ${entry.text} ${link(entry.target)}`);
        lines.push('');
      }
      return { conceptId: concept.id, path: `${prefix}${stem}.md`, content: `${lines.join('\n')}` };
    });
}
