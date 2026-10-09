import type { SourceKind, SourceParser } from '@skb/core';
import type { AiReader } from '../../ai/reader';
import { docxParser } from './docx';
import { createImageParser, withScanReading } from './image';
import { createMediaParser } from './media';
import { pdfParser } from './pdf';
import { pptxParser } from './pptx';
import { textParser } from './text';

/**
 * Parsers by source kind (architecture.md §12). A parser's `version` changes when its output does.
 * Recordings, images and scanned pages are read by the AI layer when it is set up (Phase 11).
 */
export function createParsers(reader: AiReader | null): readonly SourceParser[] {
  return [
    withScanReading(pdfParser, reader),
    pptxParser,
    docxParser,
    textParser,
    createMediaParser(reader),
    createImageParser(reader),
  ];
}

/** The parsers without AI: documents are read as before; recordings and images are not read. */
export const PARSERS: readonly SourceParser[] = createParsers(null);

export function parserFor(
  kind: SourceKind,
  parsers: readonly SourceParser[] = PARSERS,
): SourceParser | null {
  return parsers.find((parser) => parser.kinds.includes(kind)) ?? null;
}

export { SourceParseError } from './errors';
