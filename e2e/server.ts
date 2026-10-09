import { type ChildProcess, fork } from 'node:child_process';
import path from 'node:path';
import { E2E_TOKEN } from './constants';

/**
 * A server of a test's own, on its own port and folders, for tests that restart it (persistence
 * across restarts). The shared Playwright server is left alone.
 */

export function startServer(dir: string, port: number): Promise<ChildProcess> {
  const child = fork(path.resolve('apps/server/dist/server.mjs'), ['--port', String(port)], {
    env: {
      ...process.env,
      SKB_VAULT: path.join(dir, 'vault'),
      SKB_DATA_DIR: path.join(dir, 'data'),
      SKB_AUTH_TOKEN: E2E_TOKEN,
      SKB_LOG_LEVEL: 'warn',
      SKB_NO_BROWSER: '1',
    },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  return new Promise((resolve, reject) => {
    child.on(
      'message',
      (message: { type?: string }) => message?.type === 'skb:ready' && resolve(child),
    );
    child.once('exit', (code) => reject(new Error(`The server exited early (code ${code}).`)));
  });
}

export function stopServer(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    child.send({ type: 'skb:shutdown' });
  });
}
