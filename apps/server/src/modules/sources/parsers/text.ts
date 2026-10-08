import type { NormalisedDocument, NormalisedSection, ParseInput, SourceParser } from '@skb/core';
import { analyseNote, type NoteAnalysis } from '@skb/core/markdown';

/**
 * Markdown and plain-text sources (task 5.07). Markdown is split at its headings with the same
 * fence-aware analysis used for notes, so a `#` inside a code block never starts a section; each
 * section keeps its raw Markdown (line numbers stay exact for locators, and the viewer renders it).
 * Plain text has no structure, so it is one section that the chunker cuts at paragraphs.
 */

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
const lenient = new TextDecoder('utf-8', { ignoreBOM: false });

function decode(bytes: Uint8Array): { text: string; valid: boolean } {
  try {
    return { text: utf8.decode(bytes), valid: true };
  } catch {
    return { text: lenient.decode(bytes), valid: false };
  }
}

function lineOf(text: string, offset: number): number {
  let line = 1;
  for (
    let index = text.indexOf('\n');
    index !== -1 && index < offset;
    index = text.indexOf('\n', index + 1)
  )
    line += 1;
  return line;
}

function markdownSections(
  text: string,
  analysis: NoteAnalysis,
  sourceId: string,
): NormalisedSection[] {
  const sections: NormalisedSection[] = [];
  const stack: { level: number; text: string }[] = [];
  const boundaries = [
    { offset: analysis.bodyStart, heading: null as null | { level: number; text: string } },
    ...analysis.headings.map((heading) => ({ offset: heading.offset, heading })),
  ];
  boundaries.forEach((boundary, index) => {
    const end = boundaries[index + 1]?.offset ?? text.length;
    if (boundary.heading) {
      while ((stack.at(-1)?.level ?? 0) >= boundary.heading.level) stack.pop();
      stack.push({ level: boundary.heading.level, text: boundary.heading.text });
    }
    const body = text.slice(boundary.offset, end).replace(/\s+$/, '');
    if (!boundary.heading && body.trim() === '') return;
    const headingPath = stack.map((entry) => entry.text);
    sections.push({
      kind: 'heading',
      label: boundary.heading?.text ?? 'Start',
      text: body,
      notes: null,
      headingPath,
      locator: { kind: 'text', sourceId, headingPath, line: lineOf(text, boundary.offset) },
    });
  });
  return sections;
}

export const textParser: SourceParser = {
  kinds: ['markdown', 'text'],
  version: 'text-1',
  async parse(input: ParseInput): Promise<NormalisedDocument> {
    const { text: raw, valid } = decode(input.bytes);
    // Line endings are normalised so that offsets and line numbers agree everywhere.
    const text = raw.replace(/\r\n?/g, '\n');
    const isMarkdown = /\.(md|markdown)$/i.test(input.fileName);
    const analysis = isMarkdown ? analyseNote(text) : null;
    const warnings = valid
      ? []
      : [{ code: 'not-utf8', message: 'Some characters were not valid UTF-8 and were replaced.' }];
    const sections: NormalisedSection[] = analysis
      ? markdownSections(text, analysis, input.sourceId)
      : text.trim() === ''
        ? []
        : [
            {
              kind: 'segment',
              label: 'Text',
              text: text.replace(/\s+$/, ''),
              notes: null,
              headingPath: [],
              locator: { kind: 'text', sourceId: input.sourceId, headingPath: [], line: 1 },
            },
          ];
    if (sections.every((section) => section.text.trim() === ''))
      warnings.push({ code: 'no-text', message: 'The file contains no text.' });
    input.onProgress?.(1);
    return {
      title:
        analysis?.title ?? analysis?.headings.find((heading) => heading.level === 1)?.text ?? null,
      pageCount: null,
      sections,
      warnings,
      metadata: {},
    };
  },
};
