/**
 * Citations in grounded answers (agent-system.md §5). The model cites passages by key — `[S2]`,
 * or several at once as `[S1, S3]` — after each sourced claim. The server keeps only keys it gave
 * the model, and labels the answer by how much of it is cited.
 */

export const CITATION = /\[(S\d{1,3}(?:\s*[,;]\s*S\d{1,3})*)\]/g;

export interface CitationCheck {
  /** The answer with unknown keys removed (and lists of keys tidied). */
  text: string;
  /** Known keys in order of first use. */
  used: string[];
  /** Keys the model invented. */
  unknown: string[];
}

/** Keeps citations to known passages and drops the rest. */
export function checkCitations(text: string, known: ReadonlySet<string>): CitationCheck {
  const used: string[] = [];
  const unknown: string[] = [];
  const cleaned = text.replace(CITATION, (_match, inner: string) => {
    const keys = inner.split(/\s*[,;]\s*/u);
    const kept = keys.filter((key) => {
      if (known.has(key)) {
        if (!used.includes(key)) used.push(key);
        return true;
      }
      if (!unknown.includes(key)) unknown.push(key);
      return false;
    });
    return kept.length ? `[${kept.join(', ')}]` : '';
  });
  // A dropped citation can leave a space before punctuation: "claim [S9]." → "claim ."
  return { text: cleaned.replace(/[ \t]+([.,;:!?])/gu, '$1'), used, unknown };
}

export type Grounding = 'sources' | 'mixed' | 'general';

/** Sentences worth a citation: not headings, not short connective lines. */
function claims(text: string): string[] {
  return text
    .replace(/```[\s\S]*?```/gu, ' ')
    .split(/\n+/u)
    .filter((line) => !/^\s*#/u.test(line))
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9[(])/u))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.replace(CITATION, '').trim().split(/\s+/u).length >= 4);
}

/**
 * From your sources (every claim cited), general knowledge (none cited) or mixed. A claim is a
 * sentence of four words or more outside headings and code; it counts as cited when it carries a
 * key.
 */
export function classifyGrounding(text: string): Grounding {
  const sentences = claims(text);
  if (sentences.length === 0) return 'general';
  const cited = sentences.filter((sentence) => new RegExp(CITATION.source).test(sentence)).length;
  if (cited === 0) return 'general';
  return cited === sentences.length ? 'sources' : 'mixed';
}
