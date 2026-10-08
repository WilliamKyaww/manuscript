import type {
  NormalisedDocument,
  NormalisedSection,
  ParseInput,
  ParseWarning,
  SourceParser,
} from '@skb/core';
import { SourceParseError } from './errors';

/**
 * PDF sources (task 5.08): one section per page with the text pdf.js extracts, so search results and
 * citations point at a page (ADR-0019 spike: `pdfjs-dist` legacy build, used directly). Pages without
 * a text layer (scans, pictures of slides) are reported, not treated as errors: the PDF can still be
 * viewed. pdf.js is loaded on first use, with its worker running in-process.
 */

export const MAX_PDF_PAGES = 3000;
/** Fewer visible characters than this means a page has no usable text layer. */
const MIN_PAGE_CHARACTERS = 10;

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjs: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  pdfjs ??= (async () => {
    // pdf.js looks for an in-process worker here before trying to spawn one from a file, which the
    // bundled server could not do.
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    return import('pdfjs-dist/legacy/build/pdf.mjs');
  })();
  return pdfjs;
}

interface TextItemLike {
  str?: unknown;
  hasEOL?: unknown;
}

/**
 * Joins pdf.js text items into lines, tidying spaces but keeping the page's line structure. A word
 * hyphenated across a line end between lower-case letters ("con-\nsensus") is rejoined so that it
 * can be found; a genuine compound broken at its hyphen loses the hyphen, a smaller cost than words
 * that search can never match.
 */
export function pageText(items: readonly TextItemLike[]): string {
  let text = '';
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    text += item.str;
    if (item.hasEOL === true) text += '\n';
  }
  return (
    text
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stray control characters from broken fonts are removed.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/[ \t ]+\n/g, '\n')
      .replace(/[ \t ]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/(\p{Ll})-\n(\p{Ll}\S*)[^\S\n]*/gu, '$1$2\n')
      .trim()
  );
}

function describePages(pages: number[]): string {
  const shown = pages.slice(0, 10).join(', ');
  return pages.length > 10 ? `${shown} and ${pages.length - 10} more` : shown;
}

function infoString(info: Record<string, unknown>, key: string): string | null {
  const value = info[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, 500);
}

export const pdfParser: SourceParser = {
  kinds: ['pdf'],
  version: 'pdf-1',
  async parse({ bytes, sourceId, signal, onProgress }: ParseInput): Promise<NormalisedDocument> {
    const { getDocument, VerbosityLevel } = await loadPdfJs();
    signal.throwIfAborted();
    const task = getDocument({
      // pdf.js may transfer (detach) the buffer it is given, so it gets a copy — and a plain
      // Uint8Array, because it refuses Node's Buffer subclass.
      data: new Uint8Array(bytes),
      disableFontFace: true,
      useSystemFonts: false,
      stopAtErrors: false,
      verbosity: VerbosityLevel.ERRORS,
    });
    try {
      let document: Awaited<typeof task.promise>;
      try {
        document = await task.promise;
      } catch (error) {
        const name = (error as { name?: string }).name;
        if (name === 'PasswordException') {
          throw new SourceParseError(
            'This PDF is protected by a password. Save an unprotected copy and import that.',
            { cause: error },
          );
        }
        throw new SourceParseError('The PDF is damaged or is not really a PDF.', { cause: error });
      }
      const pageCount = document.numPages;
      if (pageCount > MAX_PDF_PAGES) {
        throw new SourceParseError(
          `This PDF has ${pageCount.toLocaleString('en-GB')} pages; at most ${MAX_PDF_PAGES.toLocaleString('en-GB')} can be imported.`,
        );
      }

      const sections: NormalisedSection[] = [];
      const empty: number[] = [];
      for (let number = 1; number <= pageCount; number += 1) {
        signal.throwIfAborted();
        let text = '';
        try {
          const page = await document.getPage(number);
          const content = await page.getTextContent();
          text = pageText(content.items as TextItemLike[]);
          page.cleanup();
        } catch (error) {
          if (signal.aborted) throw error;
          // One broken page should not lose the rest of the document.
          text = '';
        }
        if (text.replace(/\s/g, '').length < MIN_PAGE_CHARACTERS) {
          empty.push(number);
          // A slide number or a stray mark on an image-only page is noise, not content.
          text = '';
        }
        sections.push({
          kind: 'page',
          label: `p. ${number}`,
          text,
          notes: null,
          headingPath: [],
          locator: { kind: 'pdf', sourceId, page: number },
        });
        onProgress?.(number / pageCount);
      }

      const warnings: ParseWarning[] = [];
      if (pageCount > 0 && empty.length === pageCount) {
        warnings.push({
          code: 'no-text',
          message:
            'No text was found: the PDF appears to contain only images (for example a scan). It can be viewed but not searched.',
        });
      } else if (empty.length > 0) {
        warnings.push({
          code: 'pages-without-text',
          message: `${empty.length} of ${pageCount} pages have no text (probably images or scans) and cannot be searched: ${empty.length === 1 ? 'page' : 'pages'} ${describePages(empty)}.`,
        });
      }

      let title: string | null = null;
      const metadata: NormalisedDocument['metadata'] = {};
      try {
        const { info } = await document.getMetadata();
        const fields = (info ?? {}) as Record<string, unknown>;
        title = infoString(fields, 'Title');
        for (const [key, name] of [
          ['Title', 'title'],
          ['Author', 'author'],
          ['Subject', 'subject'],
          ['Creator', 'creator'],
        ] as const) {
          const value = infoString(fields, key);
          if (value) metadata[name] = value;
        }
      } catch {
        // Metadata is optional.
      }
      return { title, pageCount, sections, warnings, metadata };
    } finally {
      await task.destroy();
    }
  },
};
