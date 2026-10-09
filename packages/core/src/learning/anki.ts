import type { CardKind } from './cards';
import { clozeNumbers } from './cards';

/**
 * Anki's "notes in plain text" format (task 8.11): tab-separated rows with `#key:value` header
 * lines, fields quoted when they contain the separator, quotes or line breaks. Anki fields are HTML;
 * cards here are Markdown, so export escapes the text and turns line breaks into `<br>`, and import
 * does the reverse (tags are dropped, entities decoded). Maths, images and formatting travel as
 * text.
 */

export interface PlainCard {
  kind: CardKind;
  front: string;
  back: string;
}

const NOTETYPES: Record<CardKind, string> = {
  basic: 'Basic',
  reversed: 'Basic (and reversed card)',
  cloze: 'Cloze',
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '<br>');

function quote(field: string): string {
  return /[\t"\n\r]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

/** A card set as an Anki import file. */
export function toAnkiText(cards: readonly (PlainCard & { extra?: string })[]): string {
  const lines = ['#separator:tab', '#html:true', '#notetype column:1'];
  for (const card of cards) {
    const back = card.extra?.trim()
      ? `${card.back}${card.back.trim() ? '\n\n' : ''}${card.extra}`
      : card.back;
    lines.push(
      [NOTETYPES[card.kind], escapeHtml(card.front), escapeHtml(back)].map(quote).join('\t'),
    );
  }
  return `${lines.join('\n')}\n`;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** HTML from Anki to plain text: line breaks kept, tags dropped, entities decoded. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (name.startsWith('#x') || name.startsWith('#X'))
        return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
      if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
      return ENTITIES[name.toLowerCase()] ?? entity;
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const SEPARATORS: Record<string, string> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  pipe: '|',
  colon: ':',
  space: ' ',
};

/** Splits delimited text into rows of fields, honouring quotes (and line breaks inside them). */
function parseRows(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] as string;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === separator) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export interface AnkiImport {
  cards: PlainCard[];
  skipped: number;
}

/**
 * Reads an Anki plain-text export (or any tab- or comma-separated list of front and back). The
 * note type column decides the kind; without one, text with `{{c1::…}}` is a cloze card.
 */
export function fromAnkiText(text: string): AnkiImport {
  const headers = new Map<string, string>();
  const body: string[] = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const header = /^#([a-z ]+):(.*)$/i.exec(line);
    if (header && body.length === 0)
      headers.set((header[1] as string).trim().toLowerCase(), (header[2] as string).trim());
    else body.push(line);
  }
  const separatorName = headers.get('separator')?.toLowerCase() ?? 'tab';
  const separator =
    SEPARATORS[separatorName] ?? (separatorName.length === 1 ? separatorName : '\t');
  const html = (headers.get('html') ?? 'true').toLowerCase() === 'true';
  const column = (name: string) => {
    const value = Number(headers.get(name));
    return Number.isInteger(value) && value > 0 ? value - 1 : null;
  };
  const notetypeColumn = column('notetype column');
  const skipColumns = new Set(
    [notetypeColumn, column('deck column'), column('tags column'), column('guid column')].filter(
      (value): value is number => value !== null,
    ),
  );

  const cards: PlainCard[] = [];
  let skipped = 0;
  for (const row of parseRows(body.join('\n'), separator)) {
    if (row.every((field) => field.trim() === '')) continue;
    const fields = row
      .filter((_field, index) => !skipColumns.has(index))
      .map((field) => (html ? htmlToText(field) : field.trim()));
    const [front = '', back = ''] = fields;
    if (front === '') {
      skipped += 1;
      continue;
    }
    const notetype = notetypeColumn === null ? '' : (row[notetypeColumn] ?? '').toLowerCase();
    const kind: CardKind =
      notetype.includes('cloze') || (notetype === '' && clozeNumbers(front).length > 0)
        ? 'cloze'
        : notetype.includes('reverse')
          ? 'reversed'
          : 'basic';
    cards.push({ kind, front, back });
  }
  return { cards, skipped };
}
