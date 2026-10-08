import type { NormalisedDocument, NormalisedSection, ParseInput, SourceParser } from '@skb/core';
import { SourceParseError } from './errors';
import { coreTitle } from './office';
import { attribute, elements, find, localName, parseXml, path, type XmlElement } from './xml';
import { decodeXml, readZipEntries } from './zip';

/**
 * Word sources (task 5.10, ADR-0019 "DOCX change"): `word/document.xml` read in-house into
 * Markdown-style blocks — headings, paragraphs, list items and pipe tables — and split into sections
 * at headings. Heading levels come from the paragraph's style (by its *name*, so translated style ids
 * such as "berschrift1" work) or its outline level. Deleted tracked changes are left out; inserted
 * ones are kept. Each block is one paragraph in the locator's numbering, and sections join their
 * blocks with a blank line (the chunker counts those to locate chunks).
 */

const MAX_LEVEL = 6;

interface StyleInfo {
  name: string;
  basedOn: string | null;
  outlineLevel: number | null;
}

function readStyles(xml: string | null): Map<string, StyleInfo> {
  const styles = new Map<string, StyleInfo>();
  if (!xml) return styles;
  const root = parseXml(xml, 'document styles');
  for (const style of elements(elements(root)[0] ?? root, 'style')) {
    if (attribute(style, 'type') !== 'paragraph') continue;
    const id = attribute(style, 'styleId');
    if (!id) continue;
    const outline = attribute(path(style, 'pPr', 'outlineLvl'), 'val');
    styles.set(id, {
      name: attribute(path(style, 'name'), 'val') ?? id,
      basedOn: attribute(path(style, 'basedOn'), 'val') ?? null,
      outlineLevel: outline === undefined ? null : Number(outline),
    });
  }
  return styles;
}

/** Heading level (1–6) of a paragraph style, following `basedOn`; null for body text. */
function styleLevel(styleId: string | undefined, styles: Map<string, StyleInfo>): number | null {
  const seen = new Set<string>();
  let current = styleId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const style = styles.get(current);
    const name = (style?.name ?? current).toLowerCase().replace(/\s+/g, ' ').trim();
    if (name === 'title') return 1;
    const named = /^heading ?([1-9])$/.exec(name);
    if (named?.[1]) return Math.min(Number(named[1]), MAX_LEVEL);
    if (style?.outlineLevel !== null && style?.outlineLevel !== undefined && style.outlineLevel < 9)
      return Math.min(style.outlineLevel + 1, MAX_LEVEL);
    current = style?.basedOn ?? undefined;
  }
  return null;
}

/** Visible text of a paragraph (or any run container), skipping deleted text and field codes. */
function runText(node: XmlElement): string {
  let text = '';
  const visit = (element: XmlElement) => {
    for (const child of element.children) {
      if (typeof child === 'string') continue;
      const name = localName(child.name);
      if (name === 't') text += child.children.filter((part) => typeof part === 'string').join('');
      else if (name === 'tab') text += '\t';
      else if (name === 'br' || name === 'cr') text += '\n';
      else if (name === 'noBreakHyphen') text += '-';
      else if (name === 'p') {
        // A paragraph inside a text box: keep it on its own line.
        visit(child);
        text += '\n';
      } else if (
        name !== 'del' &&
        name !== 'instrText' &&
        name !== 'delText' &&
        name !== 'pPr' &&
        name !== 'rPr'
      )
        visit(child);
    }
  };
  visit(node);
  return text.replace(/[  ]+/g, ' ').trim();
}

/** Stops paragraph text from being read as Markdown syntax it never was. */
export function escapeBlockStart(text: string): string {
  return text.replace(/^([#>+*|-]|\d+[.)])/, '\\$1');
}

interface Block {
  text: string;
  heading: number | null;
}

function tableBlock(table: XmlElement): string {
  const rows = elements(table, 'tr').map((row) =>
    elements(row, 'tc').map((cell) =>
      elements(cell)
        .map(runText)
        .filter(Boolean)
        .join(' ')
        .replace(/\|/g, '\\|')
        .replace(/\s+/g, ' '),
    ),
  );
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((cells) => cells.length));
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, index) => cells[index] ?? '').join(' | ')} |`;
  const [header = [], ...rest] = rows;
  return [line(header), line(Array.from({ length: width }, () => '---')), ...rest.map(line)].join(
    '\n',
  );
}

function collectBlocks(container: XmlElement, styles: Map<string, StyleInfo>, into: Block[]): void {
  for (const node of elements(container)) {
    const name = localName(node.name);
    if (name === 'p') {
      const properties = path(node, 'pPr');
      const text = runText(node).replace(/\n{2,}/g, '\n');
      if (!text) continue;
      const outline = attribute(path(properties, 'outlineLvl'), 'val');
      const level =
        outline !== undefined && Number(outline) < 9
          ? Math.min(Number(outline) + 1, MAX_LEVEL)
          : styleLevel(attribute(path(properties, 'pStyle'), 'val'), styles);
      if (level !== null) {
        into.push({ text: text.replace(/\s+/g, ' '), heading: level });
      } else if (path(properties, 'numPr')) {
        const depth = Number(attribute(path(properties, 'numPr', 'ilvl'), 'val') ?? 0);
        into.push({
          text: `${'  '.repeat(Math.min(depth, 8))}- ${text.replace(/\n/g, ' ')}`,
          heading: null,
        });
      } else {
        into.push({ text: escapeBlockStart(text), heading: null });
      }
    } else if (name === 'tbl') {
      const text = tableBlock(node);
      if (text) into.push({ text, heading: null });
    } else if (name === 'sdt' || name === 'customXml' || name === 'ins' || name === 'smartTag') {
      collectBlocks(path(node, 'sdtContent') ?? node, styles, into);
    }
  }
}

export const docxParser: SourceParser = {
  kinds: ['docx'],
  version: 'docx-1',
  async parse({ bytes, sourceId, signal, onProgress }: ParseInput): Promise<NormalisedDocument> {
    const files = readZipEntries(
      bytes,
      (name) =>
        name === 'word/document.xml' || name === 'word/styles.xml' || name === 'docProps/core.xml',
      'document',
    );
    const documentXml = decodeXml(files.get('word/document.xml'));
    if (!documentXml)
      throw new SourceParseError('This is not a Word document (document.xml is missing).');
    signal.throwIfAborted();
    const styles = readStyles(decodeXml(files.get('word/styles.xml')));
    const body = find(parseXml(documentXml, 'document'), 'body');
    const blocks: Block[] = [];
    if (body) collectBlocks(body, styles, blocks);
    signal.throwIfAborted();

    const sections: NormalisedSection[] = [];
    const stack: { level: number; text: string }[] = [];
    let current: { section: NormalisedSection; parts: string[] } | null = null;
    const flush = () => {
      if (current) {
        current.section.text = current.parts.join('\n\n');
        sections.push(current.section);
      }
    };
    for (const [paragraph, block] of blocks.entries()) {
      if (block.heading !== null || !current) {
        flush();
        if (block.heading !== null) {
          while ((stack.at(-1)?.level ?? 0) >= block.heading) stack.pop();
          stack.push({ level: block.heading, text: block.text });
        }
        const headingPath = stack.map((entry) => entry.text);
        current = {
          section: {
            kind: 'heading',
            label: block.heading !== null ? block.text : 'Start',
            text: '',
            notes: null,
            headingPath,
            locator: { kind: 'docx', sourceId, headingPath, paragraph },
          },
          parts: [],
        };
      }
      current.parts.push(
        block.heading !== null ? `${'#'.repeat(block.heading)} ${block.text}` : block.text,
      );
    }
    flush();
    onProgress?.(1);

    const warnings =
      blocks.length === 0 ? [{ code: 'no-text', message: 'The document contains no text.' }] : [];
    return {
      title: coreTitle(decodeXml(files.get('docProps/core.xml'))),
      pageCount: null,
      sections,
      warnings,
      metadata: { paragraphs: blocks.length },
    };
  },
};
