import { analyseNote, normaliseKey } from '@skb/core/markdown';

/**
 * The part of a note under one heading — what `![[Note#Heading]]` embeds: from the heading to the
 * next heading of the same or a higher level. Without a heading, the note without its frontmatter.
 * Returns null when the heading does not exist.
 */
export function sectionOf(content: string, heading: string | null): string | null {
  const analysis = analyseNote(content);
  const body = content.slice(analysis.bodyStart);
  if (!heading) return body;
  const wanted = normaliseKey(heading);
  const headings = analysis.headings;
  const index = headings.findIndex(
    (candidate) => normaliseKey(candidate.text) === wanted || candidate.slug === wanted,
  );
  const start = headings[index];
  if (!start) return null;
  const next = headings.slice(index + 1).find((candidate) => candidate.level <= start.level);
  return content.slice(start.offset, next ? next.offset : content.length).trimEnd();
}
