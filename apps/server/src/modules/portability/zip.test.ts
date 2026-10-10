import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Zip, ZipPassThrough } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { createZipWriter, readZip, unsafeEntryName } from './zip';

let root: string;
afterEach(() => rmSync(root, { recursive: true, force: true }));
const temp = () => {
  root = mkdtempSync(path.join(tmpdir(), 'skb-zip-'));
  return root;
};

describe('zip files', () => {
  it('write and read back text, binary and large files, each to where the reader sends it', async () => {
    const dir = temp();
    const big = Buffer.alloc(3_000_000);
    for (let index = 0; index < big.length; index += 1) big[index] = (index * 31) % 251;
    writeFileSync(path.join(dir, 'big.bin'), big);
    writeFileSync(path.join(dir, 'slides.pdf'), Buffer.from('%PDF-1.7 fake'));

    const writer = createZipWriter(path.join(dir, 'out.zip'));
    await writer.addData('manifest.json', '{"hello":"wörld"}');
    await writer.addFile('vault/big.bin', path.join(dir, 'big.bin'));
    await writer.addFile('vault/Sources/slides.pdf', path.join(dir, 'slides.pdf'));
    await writer.addData('vault/empty.txt', '');
    await writer.finish();

    const memory = new Map<string, string>();
    const seen = await readZip(path.join(dir, 'out.zip'), (name) =>
      name === 'manifest.json'
        ? { kind: 'memory', done: (data) => memory.set(name, new TextDecoder().decode(data)) }
        : name.startsWith('vault/')
          ? { kind: 'file', path: path.join(dir, 'restored', name.slice('vault/'.length)) }
          : { kind: 'skip' },
    );
    expect(seen).toBe(4);
    expect(memory.get('manifest.json')).toBe('{"hello":"wörld"}');
    expect(readFileSync(path.join(dir, 'restored', 'big.bin')).equals(big)).toBe(true);
    expect(readFileSync(path.join(dir, 'restored', 'Sources', 'slides.pdf'), 'utf8')).toBe(
      '%PDF-1.7 fake',
    );
    expect(readFileSync(path.join(dir, 'restored', 'empty.txt'), 'utf8')).toBe('');
  });

  it('refuses names that would land outside the folder', async () => {
    const dir = temp();
    expect(unsafeEntryName('vault/a.md')).toBeNull();
    for (const name of ['../x', 'vault/../../x', '/etc/passwd', 'C:/x', '\\x', 'a\\..\\b'])
      expect(unsafeEntryName(name), name).not.toBeNull();

    // An archive that holds such a name is refused whole, before anything is written for it.
    const chunks: Uint8Array[] = [];
    const zip = new Zip((error, chunk) => {
      if (!error) chunks.push(chunk);
    });
    const entry = new ZipPassThrough('vault/../../evil.txt');
    zip.add(entry);
    entry.push(new TextEncoder().encode('evil'), true);
    zip.end();
    writeFileSync(path.join(dir, 'evil.zip'), Buffer.concat(chunks));
    await expect(
      readZip(path.join(dir, 'evil.zip'), () => ({ kind: 'file', path: path.join(dir, 'never') })),
    ).rejects.toThrow(/not safe to open/u);
    expect(() => readFileSync(path.join(dir, 'never'))).toThrow();
  });
});
