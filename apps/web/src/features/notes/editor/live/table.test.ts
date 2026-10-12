import { describe, expect, it } from 'vitest';
import { renderInline } from './inline-render';
import { isDelimiterRow, parseTable, splitRow } from './table';

describe('splitRow', () => {
  it('drops the outer pipes and trims cells', () => {
    expect(splitRow('| Crop | Classes |')).toEqual(['Crop', 'Classes']);
    expect(splitRow('Crop | Classes')).toEqual(['Crop', 'Classes']);
    expect(splitRow('|a||c|')).toEqual(['a', '', 'c']);
  });

  it('keeps escaped pipes and pipes in code in their cell', () => {
    expect(splitRow('| [[Note\\|alias]] | `a|b` |')).toEqual(['[[Note\\|alias]]', '`a|b`']);
  });
});

describe('parseTable', () => {
  it('reads header, alignment and rows', () => {
    const table = parseTable([
      '| Left | Centre | Right |',
      '|:--|:-:|--:|',
      '| a | b | c |',
      '| d | e |',
    ]);
    expect(table?.header).toEqual(['Left', 'Centre', 'Right']);
    expect(table?.align).toEqual(['left', 'center', 'right']);
    // A short row gets an empty cell.
    expect(table?.rows.map((row) => row.cells)).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', ''],
    ]);
  });

  it('records where each row starts, for placing the cursor', () => {
    const lines = ['| a | b |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |'];
    const table = parseTable(lines);
    const source = lines.join('\n');
    expect(table?.rows.map((row) => source.slice(row.offset, row.offset + 3))).toEqual([
      '| 1',
      '| 3',
    ]);
  });

  it('is not a table without a matching delimiter row', () => {
    expect(parseTable(['| a | b |', 'not a delimiter'])).toBeNull();
    expect(parseTable(['| a | b |', '|---|'])).toBeNull();
    expect(parseTable(['no pipes', '---'])).toBeNull();
    expect(isDelimiterRow('-- | --')).toBe(true);
    expect(isDelimiterRow('| --- | :-: |')).toBe(true);
    expect(isDelimiterRow('| a | b |')).toBe(false);
  });
});

describe('renderInline', () => {
  const html = (text: string) => {
    const holder = document.createElement('div');
    holder.append(renderInline(text));
    return holder.innerHTML;
  };

  it('draws the formatting that appears in cells', () => {
    expect(html('**bold** and _italic_ and ~~gone~~')).toBe(
      '<strong>bold</strong> and <em>italic</em> and <del>gone</del>',
    );
    expect(html('`code | pipe`')).toBe('<code>code | pipe</code>');
    expect(html('==marked== and ==🟢green==')).toBe(
      '<mark class="cm-highlight">marked</mark> and <mark class="cm-highlight cm-hl-green">green</mark>',
    );
    expect(html('one<br>two')).toBe('one<br>two');
  });

  it('draws links by their text and wikilinks by their alias or target', () => {
    expect(html('[the paper](https://example.org)')).toBe(
      '<span class="cm-cell-link">the paper</span>',
    );
    expect(html('[[Paxos]] and [[Raft\\|the other]]')).toBe(
      '<span class="cm-cell-link">Paxos</span> and <span class="cm-cell-link">the other</span>',
    );
  });

  it('never inserts markup from a cell', () => {
    const result = html('<img src=x onerror=alert(1)> <script>alert(1)</script>');
    expect(result).not.toContain('<img');
    expect(result).not.toContain('<script');
    expect(result).toContain('&lt;img');
  });

  it('leaves a snake_case word and an escaped mark alone', () => {
    expect(html('snake_case_name')).toBe('snake_case_name');
    expect(html('\\*not italic\\*')).toBe('*not italic*');
  });
});
