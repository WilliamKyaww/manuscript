import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { makeOfficeDocument, makeWorkbook } from '../../../../test/fixtures/file-previews';
import { makeDocx } from '../../../../test/fixtures/sources/builders';
import { createTestApp } from '../../../../test/helpers';
import { libreOfficePath, renderFileLayout } from './layout';
import { legacyWord } from './legacy-word';

let harness: ReturnType<typeof createTestApp>;
afterEach(() => harness?.cleanup());
it('explains a missing renderer without reading or changing the original', async () => {
  harness = createTestApp();
  const bytes = makeDocx([{ p: 'Original text' }]);
  const file = path.join(harness.ctx.vault.root, 'report.docx');
  writeFileSync(file, bytes);
  await expect(
    renderFileLayout(harness.modules.notes.entries, 'report.docx', null),
  ).rejects.toThrow('needs LibreOffice');
  expect(readFileSync(file)).toEqual(Buffer.from(bytes));
});

it.skipIf(!libreOfficePath())(
  'renders real DOCX/XLSX/DOC and reads legacy Word text, preserving originals',
  async () => {
    harness = createTestApp();
    const root = harness.ctx.vault.root;
    const document = makeOfficeDocument([
      { heading: 1, text: 'Preview report' },
      { p: 'Original text remains unchanged.' },
    ]);
    writeFileSync(path.join(root, 'report.docx'), document);
    writeFileSync(path.join(root, 'results.xlsx'), makeWorkbook());
    const executable = libreOfficePath();
    if (!executable) throw new Error('Missing renderer');
    await promisify(execFile)(
      executable,
      [
        `-env:UserInstallation=${pathToFileURL(path.join(root, 'office-profile')).href}`,
        '--headless',
        '--convert-to',
        'doc:MS Word 97',
        '--outdir',
        root,
        path.join(root, 'report.docx'),
      ],
      { timeout: 45_000, windowsHide: true },
    );
    expect(await legacyWord(readFileSync(path.join(root, 'report.doc')))).toContain(
      'Original text remains unchanged.',
    );
    for (const name of ['report.docx', 'results.xlsx', 'report.doc']) {
      const before = readFileSync(path.join(root, name));
      const rendered = await renderFileLayout(harness.modules.notes.entries, name);
      expect(Buffer.from(rendered).subarray(0, 5).toString()).toBe('%PDF-');
      expect(readFileSync(path.join(root, name))).toEqual(before);
    }
  },
  120_000,
);
