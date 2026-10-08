import type { SourceKind, SourceParser } from '@skb/core';
import { docxParser } from './docx';
import { pdfParser } from './pdf';
import { pptxParser } from './pptx';
import { textParser } from './text';

/** Parsers by source kind (architecture.md §12). A parser's `version` changes when its output does. */
export const PARSERS: readonly SourceParser[] = [pdfParser, pptxParser, docxParser, textParser];

export function parserFor(kind: SourceKind): SourceParser | null {
  return PARSERS.find((parser) => parser.kinds.includes(kind)) ?? null;
}

export { SourceParseError } from './errors';
