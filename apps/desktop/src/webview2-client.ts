import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { type NativeMessage, nativeEnvironment, readNativeMessage } from './webview2-protocol';

interface Options {
  executable: string;
  profile: string;
  appOrigin(): string | null;
  diagnostics?: boolean;
  onEvent(event: NativeMessage): void;
  onFailure(): void;
}
interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

/** Private anonymous pipes, not a port or a bridge exposed to external pages (ADR-0047). */
export class WebView2Client {
  private child: ChildProcessWithoutNullStreams | null = null;
  private starting: Promise<boolean> | null = null;
  private ready: ((available: boolean) => void) | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pending = new Map<number, Pending>();
  private sequence = 0;
  private buffer = '';

  constructor(private readonly options: Options) {}

  start(): Promise<boolean> {
    if (this.starting) return this.starting;
    this.starting = new Promise<boolean>((resolve) => {
      this.ready = resolve;
    });
    const args = ['--profile', this.options.profile, '--parent-process', String(process.pid)];
    if (this.options.diagnostics) args.push('--diagnostics', '1');
    const child = spawn(this.options.executable, args, {
      windowsHide: true,
      stdio: 'pipe',
      env: nativeEnvironment(process.env),
    });
    this.child = child;
    this.buffer = '';
    this.startupTimer = setTimeout(() => this.fail(child), 30_000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (this.child !== child) return;
      this.buffer += chunk;
      if (this.buffer.length > 20 * 1024 * 1024) {
        this.fail(child);
        return;
      }
      let newline = this.buffer.indexOf('\n');
      while (newline !== -1) {
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        const message = readNativeMessage(line, this.options.appOrigin());
        if (!message) {
          this.fail(child);
          return;
        }
        this.receive(message);
        newline = this.buffer.indexOf('\n');
      }
    });
    // The helper reports fixed error codes on stdout; SDK stderr is never forwarded to the UI/logs.
    child.stderr.resume();
    child.on('error', () => this.fail(child));
    child.on('exit', () => this.fail(child));
    child.stdin.on('error', () => this.fail(child));
    return this.starting;
  }

  async request(operation: string, fields: Record<string, unknown>): Promise<unknown> {
    if (!(await this.start()) || !this.child)
      throw new Error('The embedded browser is unavailable.');
    if (this.pending.size >= 256) throw new Error('The embedded browser is busy.');
    const requestId = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('The embedded browser did not respond.'));
      }, 30_000);
      this.pending.set(requestId, { resolve, reject, timeout });
      this.child?.stdin.write(`${JSON.stringify({ requestId, operation, ...fields })}\n`);
    });
  }

  private receive(message: NativeMessage): void {
    if (message.type === 'ready') {
      if (this.startupTimer) clearTimeout(this.startupTimer);
      this.startupTimer = null;
      this.ready?.(message.available);
      this.ready = null;
    } else if (message.type === 'result') {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pending.delete(message.requestId);
      if (message.ok) pending.resolve(message.value);
      else pending.reject(new Error('The embedded browser operation failed.'));
    } else this.options.onEvent(message);
  }

  private fail(child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child) return;
    this.child = null;
    this.starting = null;
    this.ready?.(false);
    this.ready = null;
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('The embedded browser stopped.'));
    }
    this.pending.clear();
    child.kill();
    this.options.onFailure();
  }

  dispose(): void {
    const child = this.child;
    if (!child) return;
    this.child = null;
    this.starting = null;
    this.ready?.(false);
    this.ready = null;
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('The embedded browser closed.'));
    }
    this.pending.clear();
    // EOF lets the helper close controllers and flush its profile before exiting.
    child.stdin.end();
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill();
    }, 2000);
    timer.unref();
    child.once('exit', () => clearTimeout(timer));
  }
}
