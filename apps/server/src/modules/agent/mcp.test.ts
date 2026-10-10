import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_ORIGIN } from '../../../test/helpers';
import { createSourcesTestbed, type SourcesTestbed } from '../../../test/sources-helpers';

/** Task 12.11: an MCP client (the official SDK's) uses the knowledge base over HTTP. */

let bed: SourcesTestbed | undefined;
let client: Client | undefined;
afterEach(async () => {
  await client?.close();
  client = undefined;
  bed?.cleanup();
  bed = undefined;
});

async function connect(auth: 'bearer' | 'none' = 'bearer') {
  bed = createSourcesTestbed();
  await bed.start();
  const testbed = bed;
  const transport = new StreamableHTTPClientTransport(new URL(`${TEST_ORIGIN}/api/mcp`), {
    // The app is called in-process, with the same credentials a configured client would send.
    fetch: (url, init) =>
      Promise.resolve(
        testbed.request(new URL(String(url)).pathname, { ...(init as RequestInit), auth }),
      ),
  });
  client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(transport);
  return { client, bed: testbed };
}

const text = (result: unknown) =>
  ((result as { content: { text: string }[] }).content[0] as { text: string }).text;

describe('the MCP server', () => {
  it('offers read and write tools, never destructive ones, with honest annotations', async () => {
    const { client: mcp } = await connect();
    const { tools } = await mcp.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'search_knowledge',
        'get_note',
        'create_note',
        'create_flashcards',
        'get_mastery',
      ]),
    );
    for (const hidden of ['delete_note', 'merge_concepts', 'delete_cards'])
      expect(names).not.toContain(hidden);
    expect(tools.find((tool) => tool.name === 'search_knowledge')?.annotations?.readOnlyHint).toBe(
      true,
    );
    expect(tools.find((tool) => tool.name === 'create_note')?.annotations?.readOnlyHint).toBe(
      false,
    );
    expect(tools.find((tool) => tool.name === 'search_knowledge')?.inputSchema).toMatchObject({
      type: 'object',
      required: ['query'],
    });
  });

  it('lets a client search and read the knowledge base', async () => {
    const { client: mcp, bed: testbed } = await connect();
    testbed.modules.notes.notes.create({ title: 'Paxos', content: 'Ballots decide the value.\n' });
    const found = await mcp.callTool({ name: 'search_knowledge', arguments: { query: 'ballots' } });
    expect(found.isError).toBeFalsy();
    const parsed = JSON.parse(text(found)) as {
      result: { results: { title: string; id: string }[] };
    };
    expect(parsed.result.results[0]?.title).toBe('Paxos');
    const note = await mcp.callTool({
      name: 'get_note',
      arguments: { id: parsed.result.results[0]?.id },
    });
    expect(text(note)).toContain('Ballots decide the value.');
    // Text from notes arrives labelled as data.
    expect(text(note)).toContain('untrusted_source');
  });

  it('logs what a client changes as the MCP actor, undoable in the app', async () => {
    const { client: mcp, bed: testbed } = await connect();
    const created = await mcp.callTool({
      name: 'create_note',
      arguments: { title: 'From MCP', content: 'hello\n' },
    });
    expect(created.isError).toBeFalsy();
    const [action] = testbed.modules.agent.registry.actions(5);
    expect(action).toMatchObject({
      tool: 'create_note',
      actor: 'mcp',
      status: 'executed',
      undoable: true,
    });
    await testbed.modules.agent.registry.undo(action?.id as string);
    expect(testbed.modules.notes.notes.tree().notes).toEqual([]);
  });

  it('answers bad calls and refusals as tool errors the client can read', async () => {
    const { client: mcp, bed: testbed } = await connect();
    const invalid = await mcp.callTool({ name: 'get_note', arguments: { id: 'nope' } });
    expect(invalid.isError).toBe(true);
    // A tool the person set to "ask" cannot be approved from MCP, so it is refused.
    testbed.modules.agent.setPermission('create_note', 'ask');
    const refused = await mcp.callTool({ name: 'create_note', arguments: { title: 'Nope' } });
    expect(refused.isError).toBe(true);
    expect(text(refused)).toMatch(/approval inside Manuscript/u);
    expect(testbed.modules.notes.notes.tree().notes).toEqual([]);
    // Destructive tools do not exist for the client.
    const missing = await mcp.callTool({
      name: 'delete_note',
      arguments: { id: 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7' },
    });
    expect(missing.isError).toBe(true);
  });

  it('needs the app token', async () => {
    await expect(connect('none')).rejects.toThrow();
  });
});
