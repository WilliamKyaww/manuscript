import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { makeOfficeDocument, makeWorkbook } from '../../../../test/fixtures/file-previews';
import { makeDocx } from '../../../../test/fixtures/sources/builders';
import { createTestApp } from '../../../../test/helpers';
import { libreOfficePath, renderFileLayout, runOffice, takeTurn } from './layout';
import { legacyWord } from './legacy-word';

const leftovers = () =>
  readdirSync(tmpdir()).filter((name) => name.startsWith('manuscript-preview-'));
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
/** Real conversions share the machine with the whole suite; only the deadline tests use a short one. */
const PATIENT = { deadlineMs: 110_000 };
const until = async (done: () => boolean, ms = 10_000) => {
  for (const started = Date.now(); !done(); await new Promise((r) => setTimeout(r, 50)))
    if (Date.now() - started > ms) throw new Error('Timed out waiting');
};

let harness: ReturnType<typeof createTestApp>;
afterEach(() => harness?.cleanup());
it('explains a missing renderer without reading or changing the original', async () => {
  harness = createTestApp();
  const bytes = makeDocx([{ p: 'Original text' }]);
  const file = path.join(harness.ctx.vault.root, 'report.docx');
  writeFileSync(file, bytes);
  await expect(
    renderFileLayout(harness.modules.notes.entries, 'report.docx', { executable: null }),
  ).rejects.toThrow('needs LibreOffice');
  expect(readFileSync(file)).toEqual(Buffer.from(bytes));
});

it('ends a launcher’s children as well as the launcher when stopped', async () => {
  // soffice is a launcher for the real office process; a fake one with a grandchild stands in for it.
  harness = createTestApp();
  const pidFile = path.join(harness.ctx.vault.root, 'grandchild.pid');
  const launcher = `
    const child = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    require('node:fs').writeFileSync(process.argv[1], String(child.pid));
    setInterval(() => {}, 1000);`;
  for (const how of ['cancelled', 'timeout'] as const) {
    const controller = new AbortController();
    const finished = runOffice(
      process.execPath,
      ['-e', launcher, pidFile],
      how === 'timeout' ? 2500 : 30_000,
      controller.signal,
    );
    const settled = finished.catch((error: unknown) => error);
    await until(() => existsSync(pidFile));
    const grandchild = Number(readFileSync(pidFile, 'utf8'));
    expect(alive(grandchild)).toBe(true);
    if (how === 'cancelled') controller.abort();
    expect(await settled).toMatchObject({ reason: how });
    // By the time the call settles, nothing of the tree is left.
    expect(alive(grandchild)).toBe(false);
    rmSync(pidFile);
  }
}, 30_000);

it('lets one conversion run, a few wait in order, and turns the rest away', async () => {
  const first = await takeTurn(undefined);
  const order: string[] = [];
  const waiting = ['second', 'third', 'fourth'].map(async (name) => {
    const release = await takeTurn(undefined);
    order.push(name);
    release();
  });
  await expect(takeTurn(undefined)).rejects.toThrow('Several page layouts');
  expect(order).toEqual([]);
  first();
  await Promise.all(waiting);
  expect(order).toEqual(['second', 'third', 'fourth']);
  // Everything was given back: a new request is accepted at once.
  (await takeTurn(undefined))();
});

it('gives up a place in line when the request is abandoned, without blocking those behind', async () => {
  const running = await takeTurn(undefined);
  const controller = new AbortController();
  const abandoned = takeTurn(controller.signal);
  const behind = takeTurn(undefined);
  controller.abort();
  await expect(abandoned).rejects.toMatchObject({ reason: 'cancelled' });
  // The abandoned place no longer counts, so the line is not full of requests nobody is waiting for.
  const more = [takeTurn(undefined), takeTurn(undefined)];
  running();
  for (const turn of [behind, ...more]) (await turn)();
  await expect(takeTurn(AbortSignal.abort())).rejects.toMatchObject({ reason: 'cancelled' });
  (await takeTurn(undefined))();
});

it.skipIf(!libreOfficePath())(
  'stops a slow or abandoned conversion, removes its files and stays usable',
  async () => {
    harness = createTestApp();
    const entries = harness.modules.notes.entries;
    writeFileSync(
      path.join(harness.ctx.vault.root, 'report.docx'),
      makeOfficeDocument([{ p: 'Text' }]),
    );
    const before = new Set(leftovers());
    await expect(
      renderFileLayout(entries, 'report.docx', { deadlineMs: 300 }),
    ).rejects.toMatchObject({ status: 503, message: expect.stringContaining('took longer') });
    const controller = new AbortController();
    const abandoned = renderFileLayout(entries, 'report.docx', {
      ...PATIENT,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 400);
    await expect(abandoned).rejects.toThrow('cancelled');
    expect(leftovers().filter((name) => !before.has(name))).toEqual([]);
    // Neither stopped run left the single slot or the converter blocked.
    const rendered = await renderFileLayout(entries, 'report.docx', PATIENT);
    expect(Buffer.from(rendered).subarray(0, 5).toString()).toBe('%PDF-');
  },
  240_000,
);

it.skipIf(!libreOfficePath())(
  'explains damaged, empty and oversized documents without leaving files behind',
  async () => {
    harness = createTestApp();
    const entries = harness.modules.notes.entries;
    const root = harness.ctx.vault.root;
    writeFileSync(
      path.join(root, 'damaged.docx'),
      Buffer.from('PK\u0003\u0004 not really a document'),
    );
    writeFileSync(path.join(root, 'empty.xlsx'), '');
    writeFileSync(path.join(root, 'huge.docx'), Buffer.alloc(16 * 1024 * 1024 + 1));
    const before = new Set(leftovers());
    await expect(renderFileLayout(entries, 'huge.docx')).rejects.toThrow('16 MB maximum');
    await expect(renderFileLayout(entries, 'empty.xlsx')).rejects.toThrow('file is empty');
    // Unreadable bytes are refused, not drawn as text.
    await expect(renderFileLayout(entries, 'damaged.docx', PATIENT)).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining('could not be prepared'),
    });
    expect(leftovers().filter((name) => !before.has(name))).toEqual([]);
  },
  240_000,
);

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
      const rendered = await renderFileLayout(harness.modules.notes.entries, name, PATIENT);
      expect(Buffer.from(rendered).subarray(0, 5).toString()).toBe('%PDF-');
      expect(readFileSync(path.join(root, name))).toEqual(before);
    }
  },
  240_000,
);
