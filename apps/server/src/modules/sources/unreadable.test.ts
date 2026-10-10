import { closeSync, ftruncateSync, mkdirSync, openSync, writeFileSync, writeSync } from 'node:fs';
import path from 'node:path';
import { MAX_SOURCE_BYTES } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createSourcesTestbed } from '../../../test/sources-helpers';

let bed: ReturnType<typeof createSourcesTestbed> | undefined;
afterEach(() => bed?.cleanup());

describe('files in Sources that cannot be read', () => {
  it('are listed as failed, with the reason, instead of being left out', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    const folder = bed.abs('Sources/CS301');
    mkdirSync(folder, { recursive: true });
    // Empty, and too large: a real PDF header followed by a hole (the file is sparse).
    writeFileSync(path.join(folder, 'empty.txt'), '');
    const big = path.join(folder, 'huge.pdf');
    const fd = openSync(big, 'w');
    writeSync(fd, '%PDF-1.7\n');
    ftruncateSync(fd, MAX_SOURCE_BYTES + 1024);
    closeSync(fd);

    await bed.modules.notes.indexer.scan();
    await bed.settle();

    const sources = await bed.list();
    const byTitle = new Map(sources.map((source) => [source.title, source]));
    expect(byTitle.get('empty')).toMatchObject({ status: 'failed', error: 'This file is empty.' });
    expect(byTitle.get('huge')?.status).toBe('failed');
    expect(byTitle.get('huge')?.error).toMatch(/larger than 200 MB/u);

    // Settling again does not turn them into jobs or change them.
    await bed.settle();
    expect((await bed.list()).map((source) => source.status)).toEqual(['failed', 'failed']);
  });
});
