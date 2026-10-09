import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

/**
 * The stdio side of MCP (task 12.11). A client such as Claude Desktop starts `mcp.mjs` and talks
 * JSON-RPC over its standard input and output; the bridge forwards each message to the running
 * Manuscript app's MCP endpoint and each answer back. The app keeps the vault locked, so a second
 * process cannot open it: the bridge only relays, and everything — the token check, the policy,
 * the log — happens in the app.
 */

const hasId = (message: JSONRPCMessage): message is JSONRPCMessage & { id: string | number } =>
  'id' in message && message.id !== undefined;

/** Relays messages both ways until either side closes. */
export function bridge(local: Transport, remote: Transport, report: (text: string) => void): void {
  local.onmessage = (message) => {
    remote.send(message).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      report(`Could not reach Manuscript: ${reason}`);
      // A request must always be answered, or the client waits for ever.
      if (hasId(message) && 'method' in message)
        void local.send({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32000,
            message: `Manuscript did not answer (${reason}). Is the app running, and is the token right?`,
          },
        });
    });
  };
  remote.onmessage = (message) => {
    local
      .send(message)
      .catch((error: unknown) => report(`Could not answer the client: ${String(error)}`));
  };
  // Either side closing closes the other, once (each close would otherwise call the other's).
  let closing = false;
  const closeBoth = () => {
    if (closing) return;
    closing = true;
    void Promise.allSettled([local.close(), remote.close()]);
  };
  local.onclose = closeBoth;
  remote.onclose = closeBoth;
  local.onerror = (error) => report(`MCP client error: ${error.message}`);
  remote.onerror = (error) => report(`Manuscript error: ${error.message}`);
}
