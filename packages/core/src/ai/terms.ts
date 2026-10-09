/**
 * The words of a question worth searching for. A question is prose — "why does Raft need a
 * majority to elect a leader?" — so requiring every word (the search page's rule) would find
 * nothing; retrieval asks for any of its significant words and lets BM25 rank by how many match.
 */

const STOPWORDS = new Set(
  `a about above after again against all am an and any are as at be because been before being
  below between both but by can could did do does doing down during each else few for from further
  had has have having he her here hers him his how i if in into is it its itself just me more most
  my no nor not now of off on once only or other our ours out over own same she should so some such
  than that the their theirs them then there these they this those through to too under until up
  very was we were what when where which while who whom why will with would you your yours explain
  describe define tell show give example examples difference differences mean means meaning use
  used using work works happen happens please also like`.split(/\s+/u),
);

const MAX_TERMS = 16;

/** Significant words, lower-cased, without duplicates, in order of appearance. */
export function questionTerms(question: string): string[] {
  const words = question
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  const terms: string[] = [];
  for (const raw of words ?? []) {
    const word = raw.replace(/['’]s$/u, '').replace(/['’-]+$/u, '');
    if (word.length < 2 || STOPWORDS.has(word) || terms.includes(word)) continue;
    terms.push(word);
    if (terms.length === MAX_TERMS) break;
  }
  return terms;
}

/** An FTS5 query matching any of the terms (each quoted, so no term is read as syntax). */
export function anyTermQuery(terms: readonly string[]): string | null {
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR ');
}
