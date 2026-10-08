import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { makePdf } from '../../../test/fixtures/sources/builders';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';

let bed: SourcesTestbed;
afterEach(() => bed?.cleanup());

const encode = (text: string) => new TextEncoder().encode(text);

describe('following files in Sources/', () => {
  it('keeps a source through moves, edits, disappearance and return', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    const { source } = await bed.imported('Reading.md', encode('# Paxos\nSynod protocol.'));
    await bed.settle();
    const ingestedAt = (await bed.source(source.id)).ingestedAt;

    // Moved into a module folder (by hand, in another program): same source, no re-parsing.
    bed.move('Sources/Inbox/Reading.md', 'Sources/COC251/Week 1/Reading.md');
    bed.changed(['Sources/COC251/Week 1/Reading.md'], ['Sources/Inbox/Reading.md']);
    await bed.settle();
    expect(await bed.source(source.id)).toMatchObject({
      path: 'Sources/COC251/Week 1/Reading.md',
      moduleCode: 'COC251',
      status: 'ready',
      missing: false,
      ingestedAt,
    });
    expect(await bed.list()).toHaveLength(1);

    // Edited: re-ingested.
    bed.write('Sources/COC251/Week 1/Reading.md', '# Paxos\nMulti-decree Paxos and leases.');
    bed.changed(['Sources/COC251/Week 1/Reading.md']);
    await bed.settle();
    expect((await bed.sourceHits('leases')).map((hit) => hit.source.id)).toEqual([source.id]);
    expect(await bed.sourceHits('synod')).toEqual([]);

    // Deleted by hand: flagged missing and left out of search, but not forgotten.
    bed.remove('Sources/COC251/Week 1/Reading.md');
    bed.changed([], ['Sources/COC251/Week 1/Reading.md']);
    await bed.settle();
    expect(await bed.source(source.id)).toMatchObject({ missing: true });
    expect(await bed.sourceHits('leases')).toEqual([]);

    // Back somewhere else (a move that took a while): the same source again.
    bed.write('Sources/Inbox/Reading again.md', '# Paxos\nMulti-decree Paxos and leases.');
    bed.changed(['Sources/Inbox/Reading again.md']);
    await bed.settle();
    expect(await bed.source(source.id)).toMatchObject({
      path: 'Sources/Inbox/Reading again.md',
      title: 'Reading again',
      moduleCode: null,
      missing: false,
    });
    expect((await bed.sourceHits('leases')).length).toBe(1);
  });

  it('registers supported files dropped into the folder and ignores everything else', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    bed.write('Sources/COC254/Lecture 1.pdf', makePdf([['Gradient descent basics.']]));
    bed.write('Sources/COC254/diagram.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    bed.write('Sources/COC254/fake.pdf', encode('<html>not a pdf</html>'));
    bed.changed([
      'Sources/COC254/Lecture 1.pdf',
      'Sources/COC254/diagram.png',
      'Sources/COC254/fake.pdf',
    ]);
    await bed.settle();
    const sources = await bed.list();
    expect(sources.map((source) => [source.path, source.moduleCode, source.status])).toEqual([
      ['Sources/COC254/Lecture 1.pdf', 'COC254', 'ready'],
    ]);
    // A copy of a source that is still in place does not become a second source.
    bed.write('Sources/Inbox/Lecture 1 copy.pdf', bed.read('Sources/COC254/Lecture 1.pdf'));
    bed.changed(['Sources/Inbox/Lecture 1 copy.pdf']);
    await bed.settle();
    expect(await bed.list()).toHaveLength(1);
  });

  it('rebuilds the library from the folder when the database is new', async () => {
    bed = createSourcesTestbed();
    bed.write('Sources/COC251/Consensus.pdf', makePdf([['Raft and Paxos.']]));
    bed.write('Sources/Inbox/Reading.md', '# Gossip\nRumour spreading.');
    bed.write('Notes/Ordinary.md', '# A note\nNot a source.');
    await bed.start();
    await bed.settle();
    const sources = await bed.list();
    expect(
      sources.map((source) => [source.title, source.moduleCode, source.status]).sort(),
    ).toEqual([
      ['Consensus', 'COC251', 'ready'],
      ['Reading', null, 'ready'],
    ]);
    expect((await bed.sourceHits('rumour'))[0]?.source.title).toBe('Reading');
  });

  it('deletes to the trash and brings the same source back on restore', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    const { source } = await bed.imported('Lecture 3.pdf', makePdf([['Byzantine generals.']]));
    await bed.settle();

    const deleted = await bed.request(`/api/sources/${source.id}`, { method: 'DELETE' });
    expect(deleted.status).toBe(200);
    const { trashId } = (await deleted.json()) as { trashId: string };
    expect(trashId).toBeTruthy();
    expect(existsSync(bed.abs('Sources/Inbox/Lecture 3.pdf'))).toBe(false);
    expect((await bed.request(`/api/sources/${source.id}`)).status).toBe(404);
    expect(await bed.list()).toEqual([]);
    expect(await bed.sourceHits('byzantine')).toEqual([]);

    const restored = await bed.request(`/api/trash/${trashId}/restore`, { method: 'POST' });
    expect(restored.status).toBe(200);
    await bed.settle();
    expect(await bed.source(source.id)).toMatchObject({
      status: 'ready',
      path: 'Sources/Inbox/Lecture 3.pdf',
    });
    expect((await bed.sourceHits('byzantine')).map((hit) => hit.source.id)).toEqual([source.id]);
  });

  it('cancels ingestion of a source that is deleted while queued', async () => {
    bed = createSourcesTestbed();
    await bed.start();
    const { source } = await bed.imported('Lecture 3.pdf', makePdf([['Text']]));
    const job = source.job;
    await bed.request(`/api/sources/${source.id}`, { method: 'DELETE' });
    expect(bed.modules.jobs.get(job?.id ?? '')?.status).toBe('cancelled');
    await bed.settle();
    expect(bed.modules.sources.repo.byId(source.id)).toMatchObject({ status: 'pending' });
  });
});
