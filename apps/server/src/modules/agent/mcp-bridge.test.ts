import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_ORIGIN } from '../../../test/helpers';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';
import { bridge } from '../../mcp-bridge';

let bed: SourcesTestbed | undefined;
let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  client = undefined;
  bed?.cleanup();
  bed = undefined;
});

/** A client on one end of a pipe, the bridge in the middle, and the app's endpoint at the far end. */
async function connect(auth: 'bearer' | 'none') {
  bed = createSourcesTestbed();
  await bed.start();
  const testbed = bed;
  const remote = new StreamableHTTPClientTransport(new URL(`${TEST_ORIGIN}/api/mcp`), {
    fetch: (url, init) =>
      Promise.resolve(
        testbed.request(new URL(String(url)).pathname, { ...(init as RequestInit), auth }),
      ),
  });
  const [clientSide, bridgeSide] = InMemoryTransport.createLinkedPair();
  const reports: string[] = [];
  bridge(bridgeSide, remote, (text) => reports.push(text));
  await remote.start();
  await bridgeSide.start();
  client = new Client({ name: 'stdio-client', version: '1.0.0' });
  return { clientSide, reports, testbed };
}

describe('the stdio bridge', () => {
  it('relays a client’s requests to the app and the answers back', async () => {
    const { clientSide, testbed } = await connect('bearer');
    testbed.modules.notes.notes.create({ title: 'Raft', content: 'Leaders are elected.\n' });
    await (client as Client).connect(clientSide);
    const { tools } = await (client as Client).listTools();
    expect(tools.map((tool) => tool.name)).toContain('search_knowledge');
    const found = await (client as Client).callTool({ name: 'list_notes', arguments: {} });
    expect(JSON.stringify(found)).toContain('Raft');
  });

  it('answers a request with an error, and says why, when the app refuses it', async () => {
    const { clientSide, reports } = await connect('none');
    await expect((client as Client).connect(clientSide)).rejects.toThrow(/did not answer|token/u);
    expect(reports.join('\n')).toMatch(/Could not reach Manuscript/u);
  });
});
