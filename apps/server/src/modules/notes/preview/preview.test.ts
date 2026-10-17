import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { FilePreviewSchema } from '@skb/core';
import { strToU8, zipSync } from 'fflate';
import { afterEach, expect, it } from 'vitest';
import { makeDocx } from '../../../../test/fixtures/sources/builders';
import { createTestApp } from '../../../../test/helpers';
import { csvRows, workbookSheets } from './tables';

let harness: ReturnType<typeof createTestApp>;
afterEach(() => harness?.cleanup());
const previewOf = async (name: string) =>
  FilePreviewSchema.parse(await (await harness.request(`/api/file-preview?path=${name}`)).json());
it('previews text, data, Office and images without rewriting the originals', async () => {
  harness = createTestApp();
  const files = {
    'example.json': '{"answer":42}',
    'sample.html': '<script>window.bad=true</script>',
    'data.csv': 'Name,Value\r\n"Smith, Jo",2',
    'diagram.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'report.docx': makeDocx([{ heading: 1, text: 'Report' }, { p: 'Readable content' }]),
  };
  for (const [name, bytes] of Object.entries(files))
    writeFileSync(path.join(harness.ctx.vault.root, name), bytes);
  await harness.modules.start({ watch: false });
  for (const [name, kind] of [
    ['example.json', 'code'],
    ['sample.html', 'code'],
    ['data.csv', 'table'],
    ['diagram.svg', 'image'],
    ['report.docx', 'document'],
  ]) {
    const response = await harness.request(`/api/file-preview?path=${name}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind });
  }
  expect((await harness.request('/api/file-preview?path=..%2Fsecret.txt')).status).toBe(400);
  expect((await harness.request('/api/file-preview?path=.skb%2Fskb.db')).status).toBe(400);
  expect((await harness.request('/api/file-preview?path=missing.txt')).status).toBe(404);
});
it('shows JSON numbers, key order and repeated keys exactly as written', async () => {
  harness = createTestApp();
  const source =
    '{"id":12345678901234567890,"price":1.0,"huge":1e400,"neg":-0.0,"a":1,"a":2,' +
    '"tricky":"{,}\\"[\\\\","nested":{"list":[1,{"x":null}],"empty":{},"none":[ ]}}';
  writeFileSync(path.join(harness.ctx.vault.root, 'ids.json'), source);
  await harness.modules.start({ watch: false });
  const body = await previewOf('ids.json');
  expect(body.notice).toBeNull();
  expect(body.sourceText).toBe(source);
  expect(body.text).toBe(
    [
      '{',
      '  "id": 12345678901234567890,',
      '  "price": 1.0,',
      '  "huge": 1e400,',
      '  "neg": -0.0,',
      '  "a": 1,',
      '  "a": 2,',
      '  "tricky": "{,}\\"[\\\\",',
      '  "nested": {',
      '    "list": [',
      '      1,',
      '      {',
      '        "x": null',
      '      }',
      '    ],',
      '    "empty": {},',
      '    "none": []',
      '  }',
      '}',
    ].join('\n'),
  );
});
it('says a long JSON file is cut short, not that it is invalid, and bounds hostile nesting', async () => {
  harness = createTestApp();
  const long = JSON.stringify({ values: Array.from({ length: 100_000 }, (_, index) => index) });
  expect(long.length).toBeGreaterThan(500_000);
  writeFileSync(path.join(harness.ctx.vault.root, 'long.json'), long);
  writeFileSync(
    path.join(harness.ctx.vault.root, 'deep.json'),
    `${'['.repeat(150_000)}${']'.repeat(150_000)}`,
  );
  writeFileSync(path.join(harness.ctx.vault.root, 'broken.json'), '{"a": ');
  await harness.modules.start({ watch: false });
  const cut = await previewOf('long.json');
  expect(cut.notice).toContain('first 500,000 characters');
  expect(cut.text.length).toBeLessThanOrEqual(500_000);
  expect(cut.text.startsWith('{\n  "values": [\n    0,')).toBe(true);
  const started = Date.now();
  const deep = await harness.request('/api/file-preview?path=deep.json');
  expect(deep.status).toBe(200);
  expect(FilePreviewSchema.parse(await deep.json()).text.length).toBeLessThanOrEqual(500_000);
  expect(Date.now() - started).toBeLessThan(5000);
  const broken = await previewOf('broken.json');
  expect(broken.notice).toContain('not valid JSON');
  expect(broken.text).toBe('{"a": ');
});
it('handles quoted CSV newlines and escaped quotation marks', () => {
  expect(csvRows('a,"b\nline","a""b"\r\n1,2,3')).toEqual([
    ['a', 'b\nline', 'a"b'],
    ['1', '2', '3'],
  ]);
});
it('reads sheet names, sparse cells, shared text and saved formula results', () => {
  const bytes = zipSync(
    Object.fromEntries(
      Object.entries({
        'xl/workbook.xml':
          '<workbook><sheets><sheet name="Results" r:id="r1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels':
          '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>',
        'xl/sharedStrings.xml': '<sst><si><t>Plant</t></si></sst>',
        'xl/worksheets/sheet1.xml':
          '<worksheet><sheetData><row><c r="A1" t="s"><v>0</v></c><c r="C1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>',
      }).map(([name, text]) => [name, strToU8(text)]),
    ),
  );
  expect(workbookSheets(bytes)).toEqual([{ name: 'Results', rows: [['Plant', '', '2']] }]);
});
const sheetBook = (sheetData: string, relationTarget = 'worksheets/sheet1.xml') =>
  zipSync(
    Object.fromEntries(
      Object.entries({
        'xl/workbook.xml':
          '<workbook><sheets><sheet name="Data" r:id="r1"/><sheet name="Chart" r:id="r2"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="r1" Target="${relationTarget}"/><Relationship Id="r2" Target="chartsheets/sheet1.xml"/></Relationships>`,
        'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${sheetData}</sheetData></worksheet>`,
      }).map(([name, text]) => [name, strToU8(text)]),
    ),
  );
it('keeps row addresses when blank rows have no row element', () => {
  const rows = (data: string) => workbookSheets(sheetBook(data))?.[0]?.rows;
  // Row 1 is absent and row 3 is skipped; the row numbers shown must still be 2 and 4.
  expect(
    rows(
      '<row r="2"><c r="A2" t="inlineStr"><is><t>second</t></is></c></row><row r="4"><c r="B4"><v>4</v></c></row>',
    ),
  ).toEqual([[], ['second'], [], ['', '4']]);
  // A row without an address follows the previous one; a repeated or backwards address cannot reorder rows.
  expect(
    rows(
      '<row r="5"><c><v>a</v></c></row><row><c><v>b</v></c></row><row r="3"><c><v>c</v></c></row>',
    ),
  ).toEqual([[], [], [], [], ['a'], ['b'], ['c']]);
  // Nothing beyond row 1,000 is read, whatever number of row elements precede it.
  const last = rows('<row r="1000"><c><v>x</v></c></row><row r="1001"><c><v>y</v></c></row>');
  expect(last).toHaveLength(1000);
  expect(last?.[999]).toEqual(['x']);
});
it('reads only the rows and shared strings it will show, however large the sheet', () => {
  // A <!DOCTYPE> is refused wherever the reader sees it, so one placed after what is needed proves that
  // the rest was never parsed: reading 8 MB of sheet XML blocks the server for about three seconds.
  const rows = Array.from(
    { length: 1500 },
    (_, index) =>
      `<row r="${index + 1}"><c r="A${index + 1}" t="s"><v>${index === 0 ? 7 : index}</v></c></row>`,
  );
  rows.splice(1100, 0, '<!DOCTYPE tail>');
  const strings = Array.from({ length: 2000 }, (_, index) => `<si><t>text ${index}</t></si>`);
  strings.splice(1200, 0, '<!DOCTYPE tail>');
  const book = zipSync({
    'xl/workbook.xml': strToU8(
      '<workbook><sheets><sheet name="Big" r:id="r1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/sharedStrings.xml': strToU8(`<sst>${strings.join('')}</sst>`),
    'xl/worksheets/sheet1.xml': strToU8(
      `<worksheet><sheetData>${rows.join('')}</sheetData></worksheet>`,
    ),
  });
  const [sheet] = workbookSheets(book) ?? [];
  expect(sheet?.rows).toHaveLength(1000);
  // Strings are found by index even when a leading row points far into the table, and rows keep theirs.
  expect(sheet?.rows[0]).toEqual(['text 7']);
  expect(sheet?.rows[999]).toEqual(['text 999']);
});
it('explains a workbook that is too large rather than calling it damaged', async () => {
  harness = createTestApp();
  const huge = zipSync({
    'xl/workbook.xml': strToU8(
      '<workbook><sheets><sheet name="Big" r:id="r1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    // 9 MB of text that deflates to almost nothing, over the 8 MB a single part may expand to.
    'xl/worksheets/sheet1.xml': strToU8(
      `<worksheet><sheetData>${' '.repeat(9 * 1024 * 1024)}</sheetData></worksheet>`,
    ),
  });
  writeFileSync(path.join(harness.ctx.vault.root, 'huge.xlsx'), huge);
  await harness.modules.start({ watch: false });
  const response = await harness.request('/api/file-preview?path=huge.xlsx');
  expect(response.status).toBe(400);
  const problem = (await response.json()) as { detail: string };
  expect(problem.detail).toContain('expands to an unsafe size');
  expect(problem.detail).not.toContain('damaged');
});
it('reads a workbook that stores absolute part paths and a sheet that is not a worksheet', () => {
  const sheets = workbookSheets(
    sheetBook('<row r="1"><c r="A1"><v>1</v></c></row>', '/xl/worksheets/sheet1.xml'),
  );
  expect(sheets).toEqual([
    { name: 'Data', rows: [['1']] },
    { name: 'Chart', rows: [] },
  ]);
});
