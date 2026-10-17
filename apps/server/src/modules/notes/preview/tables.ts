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
export const TABLE_NOTICE =
  'Reading view shows up to 1,000 rows and 100 columns per sheet. Formula results use the values saved in the workbook.';

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
  const xml = (name: string) => parseXml(decodeXml(files.get(name)) ?? '', 'workbook');
  const workbook = xml('xl/workbook.xml');
  if (!find(workbook, 'workbook')) throw new Error('The workbook contents are missing.');
  const strings = findAll(xml('xl/sharedStrings.xml'), 'si').map(textContent);
  const relations = new Map(
    findAll(xml('xl/_rels/workbook.xml.rels'), 'Relationship')
      .filter((node) => attribute(node, 'TargetMode') !== 'External')
      .map((node) => [
        attribute(node, 'Id'),
        resolvePartPath('xl', attribute(node, 'Target') ?? ''),
      ]),
  );
  return findAll(workbook, 'sheet')
    .slice(0, 20)
    .map((sheet) => {
      const target = relations.get(attribute(sheet, 'id'));
      const rows: string[][] = [];
      for (const row of findAll(xml(target ?? ''), 'row').slice(0, ROWS)) {
        const cells: string[] = [];
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
          cells[column - 1] =
            type === 's'
              ? (strings[Number(raw)] ?? '')
              : type === 'inlineStr'
                ? textContent(child(cell, 'is') ?? cell)
                : type === 'b'
                  ? raw === '1'
                    ? 'TRUE'
                    : 'FALSE'
                  : raw || (formula ? `=${textContent(formula)}` : '');
        }
        rows.push(Array.from({ length: cells.length }, (_, index) => cells[index] ?? ''));
      }
      return { name: attribute(sheet, 'name') ?? 'Sheet', rows };
    });
}
