import {
  AiError,
  EXTENSION_MEDIA_TYPES,
  extensionOf,
  type NormalisedDocument,
  type NormalisedSection,
  type ParseWarning,
  type SourceParser,
} from '@skb/core';
import { type AiReader, MAX_READ_BYTES, MAX_READ_PAGES } from '../../ai/reader';

/**
 * Images and scanned PDFs (task 11.11). An image's text — or, for a diagram or photograph, a
 * description — is read by the chat model (which must accept images). PDF pages without a text
 * layer are read the same way, from the PDF itself. Without AI, both are imported as they are (an
 * image can be viewed, a scan's other pages searched), with a warning saying how to read them.
 */

export const IMAGE_PARSER_VERSION = 'image-1';

const notYet = (problem: string) => `${problem} Then choose “Read again” to read it with AI.`;

export function createImageParser(reader: AiReader | null): SourceParser {
  return {
    kinds: ['image'],
    version: IMAGE_PARSER_VERSION,
    async parse({ bytes, fileName, sourceId, signal, onProgress }) {
      const document = (
        sections: NormalisedSection[],
        warning: ParseWarning,
      ): NormalisedDocument => ({
        title: null,
        pageCount: null,
        sections,
        warnings: [warning],
        metadata: {},
      });
      const problem = reader ? reader.unavailable('read') : 'AI is not available.';
      if (problem || !reader)
        return document([], {
          code: 'needs-ai',
          message: `Not read yet: ${notYet(problem ?? '')}`,
        });
      if (bytes.length > MAX_READ_BYTES)
        return document([], { code: 'too-large', message: 'Images over 30 MB cannot be read.' });
      onProgress?.(0.1);
      let pages: { page: number; text: string }[];
      try {
        pages = await reader.read({
          bytes,
          mediaType: EXTENSION_MEDIA_TYPES[extensionOf(fileName)] ?? 'image/png',
          kind: 'image',
          pages: 1,
          signal,
        });
      } catch (error) {
        if (error instanceof AiError && error.reason !== 'provider')
          return document([], {
            code: 'needs-ai',
            message: `Not read yet: ${notYet(error.message)}`,
          });
        throw error;
      }
      const text = pages
        .map((page) => page.text.trim())
        .filter(Boolean)
        .join('\n\n');
      if (!text)
        return document([], { code: 'no-text', message: 'Nothing could be read in this image.' });
      return document(
        [
          {
            kind: 'segment',
            label: 'Image',
            text,
            notes: null,
            headingPath: [],
            locator: { kind: 'image', sourceId },
          },
        ],
        {
          code: 'read-by-ai',
          message:
            'The text was read (or the image described) by the AI model: check it against the image.',
        },
      );
    },
  };
}

const describePages = (pages: readonly number[]) =>
  pages.length <= 6
    ? pages.join(', ')
    : `${pages.slice(0, 5).join(', ')} and ${pages.length - 5} more`;

/**
 * Wraps the PDF parser: pages without a text layer are read by the chat model from the PDF itself
 * (the whole file is sent; only the empty pages' readings are used).
 */
export function withScanReading(base: SourceParser, reader: AiReader | null): SourceParser {
  return {
    kinds: base.kinds,
    version: base.version,
    async parse(input) {
      const parsed = await base.parse(input);
      const empty = parsed.sections.filter(
        (section) => !section.text && section.locator.kind === 'pdf',
      );
      if (empty.length === 0) return parsed;
      const scanWarning = (extra: string): ParseWarning[] =>
        parsed.warnings.map((warning) =>
          warning.code === 'no-text' || warning.code === 'pages-without-text'
            ? { ...warning, message: `${warning.message} ${extra}` }
            : warning,
        );
      const problem = reader ? reader.unavailable('read') : 'AI is not available.';
      if (problem || !reader) return { ...parsed, warnings: scanWarning(notYet(problem ?? '')) };
      if (input.bytes.length > MAX_READ_BYTES || (parsed.pageCount ?? 0) > MAX_READ_PAGES)
        return {
          ...parsed,
          warnings: scanWarning(
            'It is too large to read with AI in one go (at most 100 pages and 30 MB).',
          ),
        };
      let pages: { page: number; text: string }[];
      try {
        pages = await reader.read({
          bytes: input.bytes,
          mediaType: 'application/pdf',
          kind: 'scan',
          pages: parsed.pageCount ?? empty.length,
          signal: input.signal,
        });
      } catch (error) {
        if (error instanceof AiError && error.reason !== 'provider')
          return { ...parsed, warnings: scanWarning(notYet(error.message)) };
        throw error;
      }
      const read: number[] = [];
      const missing: number[] = [];
      const sections = parsed.sections.map((section) => {
        if (section.text || section.locator.kind !== 'pdf') return section;
        const number = section.locator.page;
        const text = pages.find((page) => page.page === number)?.text.trim() ?? '';
        (text ? read : missing).push(number);
        return text ? { ...section, text } : section;
      });
      const warnings = parsed.warnings.filter(
        (warning) => warning.code !== 'no-text' && warning.code !== 'pages-without-text',
      );
      if (read.length)
        warnings.push({
          code: 'read-by-ai',
          message: `${read.length === 1 ? 'Page' : 'Pages'} ${describePages(read)} had no text layer and ${read.length === 1 ? 'was' : 'were'} read by the AI model: check ${read.length === 1 ? 'it' : 'them'} against the original.`,
        });
      if (missing.length)
        warnings.push({
          code: 'pages-without-text',
          message: `${missing.length === 1 ? 'Page' : 'Pages'} ${describePages(missing)} still ${missing.length === 1 ? 'has' : 'have'} no text.`,
        });
      return {
        ...parsed,
        sections,
        warnings,
        metadata: { ...parsed.metadata, scanRead: read.length },
      };
    },
  };
}
