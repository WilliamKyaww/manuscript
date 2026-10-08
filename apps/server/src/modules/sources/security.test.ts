import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MAX_SOURCE_BYTES, ProblemDetailsSchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { makePdf, makeZipBomb } from '../../../test/fixtures/sources/builders';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';
import { MAX_PDF_PAGES } from './parsers/pdf';

/** Task 5.20: hostile files and names never escape the library folder or exhaust the server. */

let bed: SourcesTestbed;
afterEach(() => bed?.cleanup());

const problem = async (response: Response, status: number) => {
  expect(response.status).toBe(status);
  return ProblemDetailsSchema.parse(await response.json());
};

describe('source security', () => {
  it('neutralises path traversal and unportable names in uploaded file names', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    const pdf = (text: string) => makePdf([[text]]);
    const cases: [string, string][] = [
      ['../../evil.pdf', 'Sources/Inbox/evil.pdf'],
      ['..\\..\\windows.pdf', 'Sources/Inbox/windows.pdf'],
      ['C:\\Users\\x\\abs.pdf', 'Sources/Inbox/abs.pdf'],
      ['CON.pdf', 'Sources/Inbox/CON-note.pdf'],
      ['a:b|c?.pdf', 'Sources/Inbox/a-b-c-.pdf'],
      ['.hidden.pdf', 'Sources/Inbox/hidden.pdf'],
    ];
    for (const [index, [name]] of cases.entries()) {
      const result = await bed.imported(name, pdf(`File ${index}`));
      expect(result.source.path).toBe(cases[index]?.[1]);
    }
    // Nothing was written outside Sources/Inbox.
    expect(readdirSync(bed.ctx.vault.root).sort()).toEqual(['.skb', 'Sources']);
    expect(await problem(await bed.upload('x.pdf', pdf('x'), '../Escape'), 400)).toBeTruthy();
    expect(await problem(await bed.upload('x.pdf', pdf('x'), '.skb'), 400)).toBeTruthy();
  });

  it('refuses unsupported types and contents that do not match the extension', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    const mz = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    expect((await problem(await bed.upload('setup.exe', mz), 400)).detail).toContain(
      'cannot be imported',
    );
    expect((await problem(await bed.upload('setup.pdf', mz), 400)).detail).toContain(
      'do not match',
    );
    expect((await problem(await bed.upload('old.ppt', mz), 400)).detail).toContain('.pptx');
    expect((await problem(await bed.upload('empty.pdf', new Uint8Array()), 400)).detail).toBe(
      'The file is empty.',
    );
    expect(await bed.list()).toEqual([]);
  });

  it('fails zip bombs and oversized documents safely, with a reason', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    const bomb = await bed.imported(
      'bomb.pptx',
      makeZipBomb('ppt/presentation.xml', 60 * 1024 * 1024),
    );
    const pages = await bed.imported(
      'huge.pdf',
      makePdf(Array.from({ length: MAX_PDF_PAGES + 1 }, () => [])),
    );
    await bed.settle();
    expect(await bed.source(bomb.source.id)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('unsafe size'),
    });
    expect(await bed.source(pages.source.id)).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('at most 3,000'),
    });
  });

  it('refuses files over the size limit before reading them', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    // Zero-filled memory is only reserved, so this does not use 200 MB of RAM.
    expect(() =>
      bed.modules.sources.service.importFile({
        fileName: 'huge.pdf',
        bytes: new Uint8Array(MAX_SOURCE_BYTES + 1),
      }),
    ).toThrow('at most 200 MB');
    // Over HTTP the declared length is enough to refuse the upload.
    const response = await bed.request('/api/sources', {
      method: 'POST',
      body: 'x',
      headers: {
        'content-type': 'multipart/form-data; boundary=x',
        'content-length': String(MAX_SOURCE_BYTES + 1024 * 1024),
      },
    });
    expect((await problem(response, 400)).detail).toContain('at most 200 MB');
    expect(await bed.list()).toEqual([]);
  });

  it('imports by path only from real files outside the application folder', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    const importPath = (body: unknown) =>
      bed.request('/api/sources/import-path', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      });
    const outside = path.join(bed.root, 'outside.pdf');
    writeFileSync(outside, makePdf([['From the desktop picker.']]));
    const imported = await importPath({ path: outside, module: 'COC251' });
    expect(imported.status).toBe(201);
    expect(await imported.json()).toMatchObject({
      duplicate: false,
      source: { path: 'Sources/COC251/outside.pdf' },
    });
    await problem(await importPath({ path: 'relative/file.pdf' }), 400);
    await problem(await importPath({ path: path.join(tmpdir(), 'does-not-exist-skb.pdf') }), 404);
    await problem(await importPath({ path: bed.root }), 400);
    await problem(await importPath({ path: bed.ctx.vault.paths.database }), 400);
    expect(existsSync(bed.abs('Sources/COC251/outside.pdf'))).toBe(true);
  });
});
