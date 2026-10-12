/**
 * Markdown tables (Phase 25): the source of a pipe table split into cells, ready to be drawn. The
 * widget that draws it lives in `blocks.ts`.
 */

export type Align = 'left' | 'center' | 'right' | null;

export interface ParsedTable {
  header: string[];
  align: Align[];
  rows: {
    cells: string[] /** Offset of the row's line within the table's source. */;
    offset: number;
  }[];
}

/** Splits a row at the pipes that are not escaped and not inside code spans; outer pipes are dropped. */
export function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let code = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index] ?? '';
    if (char === '\\' && line[index + 1] === '|') {
      // An escaped pipe is a pipe in the cell (the backslash stays for wikilink aliases: `[[a\|b]]`).
      current += '\\|';
      index += 1;
      continue;
    }
    if (char === '`') {
      const run = /^`+/u.exec(line.slice(index))?.[0] ?? '`';
      if (code === 0) code = run.length;
      else if (code === run.length) code = 0;
      current += run;
      index += run.length - 1;
      continue;
    }
    if (char === '|' && code === 0) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  if (cells[0]?.trim() === '' && line.trimStart().startsWith('|')) cells.shift();
  if (cells.length > 0 && cells[cells.length - 1]?.trim() === '' && line.trimEnd().endsWith('|'))
    cells.pop();
  return cells.map((cell) => cell.trim());
}

const DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/u;

export function isDelimiterRow(line: string): boolean {
  return line.includes('-') && DELIMITER.test(line);
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  return left ? 'left' : null;
}

/** The table in `lines` (header, delimiter row, body rows), or null when they are not a table. */
export function parseTable(lines: readonly string[]): ParsedTable | null {
  const [headerLine, delimiterLine] = lines;
  if (headerLine === undefined || delimiterLine === undefined) return null;
  if (!headerLine.includes('|') || !isDelimiterRow(delimiterLine)) return null;
  const header = splitRow(headerLine);
  const delimiters = splitRow(delimiterLine);
  if (header.length === 0 || header.length !== delimiters.length) return null;
  let offset = headerLine.length + 1 + delimiterLine.length + 1;
  const rows: ParsedTable['rows'] = [];
  for (const line of lines.slice(2)) {
    const cells = splitRow(line);
    // Short rows get empty cells and extra cells are ignored, as in GFM.
    rows.push({
      cells: header.map((_, column) => cells[column] ?? ''),
      offset,
    });
    offset += line.length + 1;
  }
  return { header, align: delimiters.map(alignOf), rows };
}
