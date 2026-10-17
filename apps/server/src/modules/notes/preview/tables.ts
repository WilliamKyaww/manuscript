import type { FilePreview } from '@skb/core';
import {
  attribute,
  child,
  elements,
  find,
  findAll,
  parseXml,
  textContent,
} from '../../sources/parsers/xml';
import { decodeXml, readZipEntries, resolvePartPath } from '../../sources/parsers/zip';

const ROWS = 1000;
const COLUMNS = 100;
export const CSV_NOTICE =
  'Reading view shows up to 1,000 rows and 100 columns. Source shows the original text.';
export const WORKBOOK_NOTICE =
  'Reading view shows rows 1 to 1,000 and up to 100 columns of each sheet, with values as stored: formulas are not recalculated and dates and number formats are not applied. Page layout shows the formatting.';

export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false;
  const cell = () => {
    if (row.length < COLUMNS) row.push(value);
    value = '';
  };
  for (let i = 0; i < text.length && rows.length < ROWS; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (quoted || value === '') quoted = !quoted;
      else value += char;
    } else if (!quoted && char === ',') cell();
    else if (!quoted && (char === '\n' || char === '\r')) {
      cell();
      rows.push(row);
      row = [];
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else value += char;
  }
  if (rows.length < ROWS && (value || row.length)) {
    cell();
    rows.push(row);
  }
  return rows;
}

/**
 * The text up to the element that follows the first `count` of them. Only the first rows and strings are
 * ever shown, and reading 8 MB of sheet XML blocks the server for about three seconds, so the rest is
 * not parsed at all. (The XML reader accepts the unclosed elements this leaves.)
 */
function leading(xml: string, element: string, count: number): string {
  const open = new RegExp(`<(?:[\\w.-]+:)?${element}[\\s>/]`, 'g');
  let seen = 0;
  for (let match = open.exec(xml); match; match = open.exec(xml))
    if (++seen > count) return xml.slice(0, match.index);
  return xml;
}

/** A shared string is looked up once the rows are read, so that only the strings they use are parsed. */
type Cell = string | { shared: number };

export function workbookSheets(bytes: Uint8Array): FilePreview['sheets'] {
  const files = readZipEntries(
    bytes,
    (name) =>
      /^xl\/(workbook.xml|_rels\/workbook.xml.rels|sharedStrings.xml|worksheets\/[^/]+.xml)$/.test(
        name,
      ),
    'workbook',
    {
      maxEntries: 5000,
      maxEntryBytes: 8 * 1024 * 1024,
      maxTotalBytes: 24 * 1024 * 1024,
      maxRatio: 1000,
    },
  );
  const text = (name: string) => decodeXml(files.get(name)) ?? '';
  const workbook = parseXml(text('xl/workbook.xml'), 'workbook');
  if (!find(workbook, 'workbook')) throw new Error('The workbook contents are missing.');
  const relations = new Map(
    findAll(parseXml(text('xl/_rels/workbook.xml.rels'), 'workbook'), 'Relationship')
      .filter((node) => attribute(node, 'TargetMode') !== 'External')
      .map((node) => [
        attribute(node, 'Id'),
        resolvePartPath('xl', attribute(node, 'Target') ?? ''),
      ]),
  );
  let lastString = -1;
  const sheets = findAll(workbook, 'sheet')
    .slice(0, 20)
    .map((sheet) => {
      const target = relations.get(attribute(sheet, 'id'));
      // A row's place is its address, not its position among the row elements: blank rows are
      // usually left out of the file, and the numbers shown beside the cells must match the sheet.
      const rows: Cell[][] = [];
      let previous = 0;
      const sheetXml = parseXml(leading(text(target ?? ''), 'row', ROWS), 'workbook');
      for (const row of findAll(sheetXml, 'row')) {
        const declared = Number(attribute(row, 'r'));
        const number = Number.isInteger(declared) && declared > previous ? declared : previous + 1;
        if (number > ROWS) break;
        previous = number;
        const cells: Cell[] = [];
        for (const cell of elements(row, 'c')) {
          const reference = attribute(cell, 'r')?.match(/^[A-Z]+/i)?.[0];
          let column = reference ? 0 : cells.length + 1;
          if (reference)
            for (const letter of reference.toUpperCase())
              column = column * 26 + letter.charCodeAt(0) - 64;
          if (column < 1 || column > COLUMNS) continue;
          const value = child(cell, 'v');
          const raw = value ? textContent(value) : '';
          const type = attribute(cell, 't');
          const formula = child(cell, 'f');
          if (type === 's') {
            const shared = Number(raw);
            if (Number.isInteger(shared) && shared >= 0) lastString = Math.max(lastString, shared);
            cells[column - 1] = { shared };
          } else
            cells[column - 1] =
              type === 'inlineStr'
                ? textContent(child(cell, 'is') ?? cell)
                : type === 'b'
                  ? raw === '1'
                    ? 'TRUE'
                    : 'FALSE'
                  : raw || (formula ? `=${textContent(formula)}` : '');
        }
        rows[number - 1] = Array.from({ length: cells.length }, (_, index) => cells[index] ?? '');
      }
      return {
        name: attribute(sheet, 'name') ?? 'Sheet',
        rows: Array.from({ length: rows.length }, (_, index) => rows[index] ?? []),
      };
    });
  const strings = findAll(
    parseXml(leading(text('xl/sharedStrings.xml'), 'si', lastString + 1), 'workbook'),
    'si',
  ).map(textContent);
  return sheets.map(({ name, rows }) => ({
    name,
    rows: rows.map((row) =>
      row.map((cell) => (typeof cell === 'string' ? cell : (strings[cell.shared] ?? ''))),
    ),
  }));
}
