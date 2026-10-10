import { ValidationError } from '../errors';

/**
 * Reading a Graphify `graph.json` (task 16.06). Graphify is Apache-2.0; only its published output
 * format is used here (see docs/research/graphify.md §3), not its code. The file is untrusted input:
 * its shape is checked, labels are cleaned, sizes are capped, and an edge to nowhere is dropped.
 *
 * Also here: finding which concepts a code entity is probably about, from names alone. That is
 * deliberately plain — it only proposes; the student decides.
 */

export const GRAPHIFY_LIMITS = { nodes: 50_000, edges: 250_000, label: 256, text: 1_000 } as const;

export interface CodeEntityInput {
  /** Graphify's own id for the node, unique inside one graph. */
  key: string;
  label: string;
  /** Graphify's `file_type`: `code`, `document`, `paper`, `image`, `rationale`, `concept`. */
  kind: string;
  file: string | null;
  location: string | null;
  rationale: string | null;
}

export type CodeEdgeConfidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS';

export interface CodeEdgeInput {
  source: string;
  target: string;
  relation: string;
  confidence: CodeEdgeConfidence;
  score: number | null;
  weight: number;
}

export interface ParsedGraphify {
  entities: CodeEntityInput[];
  edges: CodeEdgeInput[];
  /** Edges left out because an end is not a node of the graph. */
  droppedEdges: number;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what we remove.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;

const clean = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).replace(CONTROL, '').trim();
  return text === '' ? null : text.slice(0, max);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const notGraphify = (why: string) =>
  new ValidationError(`That does not look like a Graphify graph.json: ${why}`);

export function parseGraphify(json: unknown): ParsedGraphify {
  if (!isRecord(json)) throw notGraphify('it is not a JSON object.');
  const nodes = json.nodes;
  if (!Array.isArray(nodes)) throw notGraphify('it has no "nodes" list.');
  const rawEdges = Array.isArray(json.links)
    ? json.links
    : Array.isArray(json.edges)
      ? json.edges
      : [];
  if (nodes.length > GRAPHIFY_LIMITS.nodes)
    throw new ValidationError(
      `That graph has ${nodes.length} nodes; at most ${GRAPHIFY_LIMITS.nodes} can be imported. Map a smaller part of the repository.`,
    );
  if (rawEdges.length > GRAPHIFY_LIMITS.edges)
    throw new ValidationError(
      `That graph has ${rawEdges.length} edges; at most ${GRAPHIFY_LIMITS.edges} can be imported.`,
    );

  const entities = new Map<string, CodeEntityInput>();
  for (const raw of nodes) {
    if (!isRecord(raw)) continue;
    const key = clean(raw.id, 512);
    if (key === null) continue;
    entities.set(key, {
      key,
      label: clean(raw.label, GRAPHIFY_LIMITS.label) ?? key.slice(0, GRAPHIFY_LIMITS.label),
      kind: clean(raw.file_type, 40) ?? 'code',
      file: clean(raw.source_file, 512),
      location: clean(raw.source_location, 64),
      rationale: clean(raw.rationale, GRAPHIFY_LIMITS.text),
    });
  }
  if (entities.size === 0) throw notGraphify('it has no usable nodes.');

  const edges: CodeEdgeInput[] = [];
  let droppedEdges = 0;
  for (const raw of rawEdges) {
    if (!isRecord(raw)) {
      droppedEdges += 1;
      continue;
    }
    // NetworkX writes ids; some tools write whole objects.
    const end = (value: unknown) => (isRecord(value) ? clean(value.id, 512) : clean(value, 512));
    const source = end(raw.source);
    const target = end(raw.target);
    if (source === null || target === null || !entities.has(source) || !entities.has(target)) {
      droppedEdges += 1;
      continue;
    }
    const confidence = String(raw.confidence ?? 'EXTRACTED').toUpperCase();
    const score = typeof raw.confidence_score === 'number' ? raw.confidence_score : null;
    const weight = typeof raw.weight === 'number' && raw.weight > 0 ? raw.weight : 1;
    edges.push({
      source,
      target,
      relation: clean(raw.relation, 64) ?? 'related_to',
      confidence:
        confidence === 'INFERRED' || confidence === 'AMBIGUOUS' ? confidence : 'EXTRACTED',
      score: score !== null && score >= 0 && score <= 1 ? score : null,
      weight,
    });
  }
  return { entities: [...entities.values()], edges, droppedEdges };
}

// --- Which concepts is a piece of code about? ----------------------------------------------------

/** `RaftNode`, `elect_leader()`, `HTTPServer.py` → lower-case words. */
export function nameWords(name: string): string[] {
  return name
    .replace(/\(\)$/u, '')
    .replace(/\.(py|js|jsx|ts|tsx|java|c|cc|cpp|h|hpp|cs|go|rs|rb|php|kt|swift|scala)$/iu, '')
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase());
}

export interface ConceptForMatching {
  id: string;
  name: string;
  aliases: readonly string[];
}

export interface CodeMatch {
  conceptId: string;
  entityKey: string;
  score: number;
  reason: string;
}

const MATCH_KINDS = new Set(['code']);
/** Words that turn up in the names of half of any repository: only an exact name counts. */
const GENERIC_WORDS = new Set([
  'data',
  'node',
  'list',
  'type',
  'name',
  'file',
  'test',
  'item',
  'user',
  'call',
  'code',
  'time',
  'tree',
  'sort',
  'hash',
  'main',
  'base',
  'util',
  'util',
  'state',
  'value',
  'index',
  'model',
  'class',
  'object',
  'string',
  'number',
  'array',
  'queue',
  'stack',
  'input',
  'output',
  'error',
  'result',
  'query',
  'event',
  'store',
]);
const PER_CONCEPT = 8;
const TOTAL = 2_000;

const containsRun = (haystack: readonly string[], needle: readonly string[]) => {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1)
    if (needle.every((word, offset) => haystack[start + offset] === word)) return true;
  return false;
};

/**
 * Proposes concept ↔ code links by name: the words of the entity's name equal a name or alias of the
 * concept (0.9), or contain it as a run of words (0.6, only for names that are specific enough).
 * Best few per concept, so a common word does not bring in a whole repository.
 */
export function matchConcepts(
  entities: readonly Pick<CodeEntityInput, 'key' | 'label' | 'kind'>[],
  concepts: readonly ConceptForMatching[],
  degree: ReadonlyMap<string, number> = new Map(),
): CodeMatch[] {
  const words = new Map(
    entities
      .filter((entity) => MATCH_KINDS.has(entity.kind))
      .map((entity) => [entity.key, nameWords(entity.label)] as const),
  );
  const labels = new Map(entities.map((entity) => [entity.key, entity.label]));
  const found: (CodeMatch & { rank: number })[] = [];

  for (const concept of concepts) {
    const names = [concept.name, ...concept.aliases]
      .map((name) => ({ name, words: nameWords(name) }))
      .filter((entry) => entry.words.length > 0);
    const mine: (CodeMatch & { rank: number })[] = [];
    for (const [key, entityWords] of words) {
      let best: { score: number; name: string; exact: boolean } | null = null;
      for (const { name, words: conceptWords } of names) {
        const exact =
          conceptWords.length === entityWords.length &&
          conceptWords.every((word, index) => word === entityWords[index]);
        const specific =
          conceptWords.length >= 2 ||
          ((conceptWords[0]?.length ?? 0) >= 4 && !GENERIC_WORDS.has(conceptWords[0] ?? ''));
        if (exact) {
          best = { score: 0.9, name, exact: true };
          break;
        }
        if (
          specific &&
          containsRun(entityWords, conceptWords) &&
          (best === null || best.score < 0.6)
        )
          best = { score: 0.6, name, exact: false };
      }
      if (best === null) continue;
      const label = labels.get(key) ?? key;
      mine.push({
        conceptId: concept.id,
        entityKey: key,
        score: best.score,
        reason: best.exact
          ? `The name “${label}” is the same as “${best.name}”.`
          : `The name “${label}” contains “${best.name}”.`,
        rank: best.score * 1000 + Math.min(degree.get(key) ?? 0, 100) - label.length / 1000,
      });
    }
    mine.sort((a, b) => b.rank - a.rank || a.entityKey.localeCompare(b.entityKey));
    found.push(...mine.slice(0, PER_CONCEPT));
  }
  return found
    .sort((a, b) => b.rank - a.rank || a.entityKey.localeCompare(b.entityKey))
    .slice(0, TOTAL)
    .map(({ rank: _rank, ...match }) => match);
}
