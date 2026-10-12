import { readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

/**
 * The engine's port, kept from one launch to the next. The window's page keeps its preferences (theme,
 * palette, Simplified UI, tabs, sidebar width) in local storage, which belongs to the page's address:
 * a new random port at every launch would be a new address, and every preference would be forgotten.
 * So the port chosen at the first launch is remembered in the data folder and used again while it is
 * free; only when another program has taken it is a new one chosen (and remembered).
 */

const FILE = 'desktop-port.json';

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.listen({ port, host: '127.0.0.1', exclusive: true }, () =>
      probe.close(() => resolve(true)),
    );
  });
}

function anyFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen({ port: 0, host: '127.0.0.1' }, () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

export function readRememberedPort(dataDir: string): number | null {
  try {
    const saved = JSON.parse(readFileSync(path.join(dataDir, FILE), 'utf8')) as { port?: unknown };
    const port = saved.port;
    return typeof port === 'number' && Number.isInteger(port) && port >= 1024 && port <= 65535
      ? port
      : null;
  } catch {
    return null;
  }
}

/** The remembered port if it is still free, otherwise a new free one, remembered for next time. */
export async function choosePort(dataDir: string): Promise<number> {
  const remembered = readRememberedPort(dataDir);
  if (remembered !== null && (await isFree(remembered))) return remembered;
  const port = await anyFreePort();
  try {
    writeFileSync(path.join(dataDir, FILE), JSON.stringify({ port }));
  } catch {
    // Not being able to remember it only means the preferences start afresh next time.
  }
  return port;
}
