import { type UtilityProcess, utilityProcess } from 'electron';

/**
 * The server, running in a utility process: the same bundle `npm start` runs, so web mode and the
 * desktop app cannot drift apart, and its synchronous SQLite work stays off the main process
 * (ADR-0016). The two talk through the messages the server already sends (`skb:ready`) and
 * understands (`skb:shutdown`).
 */

/** The exit code with which the server asks to be started again (opening another vault). */
export const RESTART_EXIT_CODE = 75;

export interface Engine {
  readonly origin: string;
  readonly port: number;
  /** Settles with the exit code when the server stops, by itself or because it was asked to. */
  readonly exited: Promise<number>;
  /** Asks the server to stop, and kills it if it has not by the deadline. */
  stop(timeoutMs?: number): Promise<number>;
}

export interface EngineOptions {
  serverPath: string;
  env: Record<string, string>;
  /** How long to wait for the server to say it is listening. */
  readyTimeoutMs?: number;
  /** Lines the server writes (the sign-in line, which carries the token, is never passed on). */
  onOutput?(line: string, stream: 'stdout' | 'stderr'): void;
}

const isReady = (
  message: unknown,
): message is { type: 'skb:ready'; port: number; origin: string } =>
  typeof message === 'object' &&
  message !== null &&
  (message as { type?: unknown }).type === 'skb:ready' &&
  typeof (message as { port?: unknown }).port === 'number' &&
  typeof (message as { origin?: unknown }).origin === 'string';

function forwardLines(
  stream: NodeJS.ReadableStream | null | undefined,
  name: 'stdout' | 'stderr',
  onOutput: EngineOptions['onOutput'],
): void {
  if (!stream || !onOutput) return;
  let pending = '';
  stream.on('data', (chunk: Buffer) => {
    pending += chunk.toString('utf8');
    const lines = pending.split(/\r?\n/u);
    pending = lines.pop() ?? '';
    for (const line of lines) {
      // The server prints its sign-in address, with the token in it, straight to the console.
      if (line.trim() === '' || /token=/iu.test(line) || /Open Manuscript:/u.test(line)) continue;
      onOutput(line, name);
    }
  });
}

export function startEngine(options: EngineOptions): Promise<Engine> {
  const child: UtilityProcess = utilityProcess.fork(options.serverPath, ['--port', '0'], {
    env: options.env,
    stdio: 'pipe',
    serviceName: 'Manuscript engine',
  });
  forwardLines(child.stdout, 'stdout', options.onOutput);
  forwardLines(child.stderr, 'stderr', options.onOutput);

  let exitCode: number | null = null;
  let resolveExit: (code: number) => void = () => {};
  const exited = new Promise<number>((resolve) => {
    resolveExit = resolve;
  });
  child.once('exit', (code) => {
    exitCode = code;
    resolveExit(code);
  });

  return new Promise<Engine>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('The Manuscript engine did not start in time.'));
    }, options.readyTimeoutMs ?? 30_000);

    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`The Manuscript engine stopped while starting (code ${code}).`));
    });
    child.on('message', (message: unknown) => {
      if (!isReady(message)) return;
      clearTimeout(timer);
      resolve({
        origin: message.origin,
        port: message.port,
        exited,
        async stop(timeoutMs = 6_000) {
          if (exitCode !== null) return exitCode;
          child.postMessage({ type: 'skb:shutdown' });
          const killer = setTimeout(() => child.kill(), timeoutMs);
          const code = await exited;
          clearTimeout(killer);
          return code;
        },
      });
    });
  });
}
