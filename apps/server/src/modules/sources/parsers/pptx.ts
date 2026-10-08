import type {
  NormalisedDocument,
  NormalisedSection,
  ParseInput,
  ParseWarning,
  SourceParser,
} from '@skb/core';
import { SourceParseError } from './errors';
import { coreTitle } from './office';
import {
  attribute,
  elements,
  find,
  findAll,
  localName,
  parseXml,
  path,
  type XmlElement,
} from './xml';
import { decodeXml, readZipEntries, resolvePartPath } from './zip';

/**
 * PowerPoint sources (task 5.09): one section per slide in presentation order (from
 * `presentation.xml`, not file names), with the title, the body text in reading order (shapes,
 * groups and tables) and the speaker notes, which lecturers often use for the actual explanation.
 */

export const MAX_SLIDES = 2000;

const RELS_NOTES = /\/notesSlide$/;
/** Placeholders that repeat on every slide and carry no content. */
const CHROME = new Set(['sldNum', 'dt', 'ftr', 'hdr', 'sldImg']);

interface Relationship {
  type: string;
  target: string;
  external: boolean;
}

function relationships(xml: string | null, description: string): Map<string, Relationship> {
  const map = new Map<string, Relationship>();
  if (!xml) return map;
  for (const rel of findAll(parseXml(xml, description), 'Relationship')) {
    const id = attribute(rel, 'Id');
    const target = attribute(rel, 'Target');
    if (!id || !target) continue;
    map.set(id, {
      type: attribute(rel, 'Type') ?? '',
      target,
      external: attribute(rel, 'TargetMode') === 'External',
    });
  }
  return map;
}

function relsPathOf(partPath: string): string {
  const slash = partPath.lastIndexOf('/');
  return `${partPath.slice(0, slash + 1)}_rels/${partPath.slice(slash + 1)}.rels`;
}

function folderOf(partPath: string): string {
  return partPath.slice(0, Math.max(0, partPath.lastIndexOf('/')));
}

/** Text of one DrawingML paragraph: runs, fields and line breaks. */
function paragraphText(paragraph: XmlElement): string {
  let text = '';
  const visit = (node: XmlElement) => {
    for (const child of node.children) {
      if (typeof child === 'string') continue;
      const name = localName(child.name);
      if (name === 't') text += child.children.filter((part) => typeof part === 'string').join('');
      else if (name === 'br') text += '\n';
      else visit(child);
    }
  };
  visit(paragraph);
  return text.replace(/[ \t ]+/g, ' ').trim();
}

function placeholderType(shape: XmlElement): string | null {
  const ph = find(shape, 'ph');
  if (!ph) return null;
  return attribute(ph, 'type') ?? 'body';
}

interface ShapeText {
  placeholder: string | null;
  lines: string[];
}

/** Text-bearing shapes in document order: shapes, pictures with text, tables, group contents. */
function shapes(tree: XmlElement, into: ShapeText[] = []): ShapeText[] {
  for (const node of elements(tree)) {
    const name = localName(node.name);
    if (name === 'grpSp') {
      shapes(node, into);
    } else if (name === 'sp') {
      const body = path(node, 'txBody');
      if (!body) continue;
      const lines = elements(body, 'p').map((paragraph) => {
        const level = Number(attribute(path(paragraph, 'pPr'), 'lvl') ?? 0);
        const text = paragraphText(paragraph);
        return text && level > 0 ? `${'  '.repeat(Math.min(level, 8))}${text}` : text;
      });
      into.push({ placeholder: placeholderType(node), lines });
    } else if (name === 'graphicFrame') {
      const table = find(node, 'tbl');
      if (!table) continue;
      const lines = elements(table, 'tr').map((row) =>
        elements(row, 'tc')
          .map((cell) => findAll(cell, 'p').map(paragraphText).filter(Boolean).join(' '))
          .join(' | '),
      );
      into.push({ placeholder: null, lines });
    }
  }
  return into;
}

function slideText(
  xml: string,
  description: string,
): { title: string | null; body: string; hidden: boolean } {
  const slide = parseXml(xml, description);
  const root = elements(slide)[0];
  const tree = path(root, 'cSld', 'spTree');
  const hidden = attribute(root, 'show') === '0';
  if (!tree) return { title: null, body: '', hidden };
  let title: string | null = null;
  const body: string[] = [];
  for (const shape of shapes(tree)) {
    if (shape.placeholder && CHROME.has(shape.placeholder)) continue;
    const text = shape.lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!text) continue;
    if (!title && (shape.placeholder === 'title' || shape.placeholder === 'ctrTitle')) {
      title = text.replace(/\s+/g, ' ');
    } else {
      body.push(text);
    }
  }
  return { title, body: body.join('\n'), hidden };
}

function notesText(xml: string, description: string): string {
  const notes = parseXml(xml, description);
  const tree = path(elements(notes)[0], 'cSld', 'spTree');
  if (!tree) return '';
  const all = shapes(tree).filter((shape) => !shape.placeholder || !CHROME.has(shape.placeholder));
  const body = all.filter((shape) => shape.placeholder === 'body');
  return (body.length > 0 ? body : all)
    .map((shape) => shape.lines.join('\n').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export const pptxParser: SourceParser = {
  kinds: ['pptx'],
  version: 'pptx-1',
  async parse({ bytes, sourceId, signal, onProgress }: ParseInput): Promise<NormalisedDocument> {
    const files = readZipEntries(
      bytes,
      (name) =>
        name === 'docProps/core.xml' ||
        name === 'ppt/presentation.xml' ||
        name === 'ppt/_rels/presentation.xml.rels' ||
        /^ppt\/(slides|notesSlides)\/(_rels\/)?[^/]+\.(xml|rels)$/.test(name),
      'presentation',
    );
    const text = (name: string) => decodeXml(files.get(name));
    const presentationXml = text('ppt/presentation.xml');
    if (!presentationXml) {
      throw new SourceParseError(
        'This is not a PowerPoint presentation (presentation.xml is missing).',
      );
    }
    const presentation = parseXml(presentationXml, 'presentation');
    const rels = relationships(text('ppt/_rels/presentation.xml.rels'), 'presentation');
    const slideIds = findAll(presentation, 'sldId');
    if (slideIds.length > MAX_SLIDES) {
      throw new SourceParseError(
        `This presentation has ${slideIds.length} slides; at most ${MAX_SLIDES} can be imported.`,
      );
    }

    const sections: NormalisedSection[] = [];
    const warnings: ParseWarning[] = [];
    let hiddenSlides = 0;
    let missing = 0;
    for (const [index, slideId] of slideIds.entries()) {
      signal.throwIfAborted();
      const number = index + 1;
      const rel = rels.get(attribute(slideId, 'r:id') ?? '');
      const slidePath = rel && !rel.external ? resolvePartPath('ppt', rel.target) : null;
      const slideXml = slidePath ? text(slidePath) : null;
      let title: string | null = null;
      let body = '';
      let notes = '';
      if (slidePath && slideXml) {
        const slide = slideText(slideXml, `slide ${number}`);
        title = slide.title;
        body = slide.body;
        if (slide.hidden) hiddenSlides += 1;
        const slideRels = relationships(text(relsPathOf(slidePath)), `slide ${number}`);
        const notesRel = [...slideRels.values()].find(
          (candidate) => RELS_NOTES.test(candidate.type) && !candidate.external,
        );
        const notesXml = notesRel
          ? text(resolvePartPath(folderOf(slidePath), notesRel.target))
          : null;
        if (notesXml) notes = notesText(notesXml, `notes of slide ${number}`);
      } else {
        missing += 1;
      }
      sections.push({
        kind: 'slide',
        label: `Slide ${number}`,
        text: [title, body].filter(Boolean).join('\n'),
        notes: notes || null,
        headingPath: title ? [title] : [],
        locator: { kind: 'slides', sourceId, slide: number, part: 'body' },
      });
      onProgress?.(number / slideIds.length);
    }

    if (missing > 0) {
      warnings.push({
        code: 'missing-slides',
        message: `${missing} slide${missing === 1 ? '' : 's'} could not be found in the file and ${missing === 1 ? 'is' : 'are'} empty here.`,
      });
    }
    if (slideIds.length > 0 && sections.every((section) => !section.text && !section.notes)) {
      warnings.push({
        code: 'no-text',
        message:
          'No text was found on any slide (the slides may be pictures). It cannot be searched.',
      });
    }
    return {
      title: coreTitle(text('docProps/core.xml')),
      pageCount: slideIds.length,
      sections,
      warnings,
      metadata: { slides: slideIds.length, hiddenSlides },
    };
  },
};
