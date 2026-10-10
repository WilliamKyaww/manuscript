import { readFileSync } from 'node:fs';
import os from 'node:os';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { APP_NAME } from '@skb/core';
import { defaultDataDir } from './config/config';
import { bridge } from './mcp-bridge';
import { tokenFilePath } from './security/token';

/**
 * `mcp.mjs` — Manuscript's MCP server for clients that start a command (Claude Desktop, Claude
 * Code): relays standard input and output to the running app's `/api/mcp` endpoint.
 *
 *   node mcp.mjs [--url http://127.0.0.1:4317/api/mcp]
 *
 * Environment: SKB_MCP_URL (the endpoint), SKB_PORT (when the app is not on 4317), SKB_MCP_TOKEN
 * (otherwise the token is read from the application data directory, SKB_DATA_DIR, where the app
 * keeps it). Nothing but protocol goes to standard output; messages for people go to standard error.
 */

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function fail(message: string): never {
  process.stderr.write(`${APP_NAME} MCP: ${message}\n`);
  process.exit(1);
}

const url =
  argument('--url') ??
  process.env.SKB_MCP_URL ??
  `http://127.0.0.1:${process.env.SKB_PORT ?? '4317'}/api/mcp`;

function token(): string {
  if (process.env.SKB_MCP_TOKEN) return process.env.SKB_MCP_TOKEN;
  const dataDir =
    process.env.SKB_DATA_DIR ?? defaultDataDir(process.platform, process.env, os.homedir());
  try {
    return readFileSync(tokenFilePath(dataDir), 'utf8').trim();
  } catch {
    return fail(
      `no access token found in ${dataDir}. Start ${APP_NAME} once, or set SKB_MCP_TOKEN (and SKB_DATA_DIR if the data folder is not the default).`,
    );
  }
}

const remote = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${token()}` } },
});
const local = new StdioServerTransport();
bridge(local, remote, (text) => process.stderr.write(`${APP_NAME} MCP: ${text}\n`));
await remote.start();
await local.start();
