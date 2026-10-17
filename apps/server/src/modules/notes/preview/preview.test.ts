import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, expect, it } from 'vitest';
import { makeDocx } from '../../../../test/fixtures/sources/builders';
import { createTestApp } from '../../../../test/helpers';
import { csvRows, workbookSheets } from './tables';

let harness: ReturnType<typeof createTestApp>;
afterEach(() => harness?.cleanup());
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
