import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_NAME, AppError } from '@skb/core';
import { ConfigError, resolveConfig, type ServerConfig } from './config/config';
import { openInBrowser } from './platform/browser';
import { type RunningServer, StartupError, startServer } from './server';
import { createLogger, type Logger } from './shared/logger';
import { VERSION } from './version';

/** The built SPA is copied next to the server bundle (`dist/web`) by the build script. */
function bundledWebDir(): string | null {
  const dir = fileURLToPath(new URL('./web/', import.meta.url));
  return existsSync(path.join(dir, 'index.html')) ? dir : null;
}

function exitWithMessage(message: string, code: number): never {
  process.stderr.write(`\n${APP_NAME}: ${message}\n\n`);
  process.exit(code);
}

interface ParentPort {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
}

function parentPort(): ParentPort | undefined {
  return (process as unknown as { parentPort?: ParentPort }).parentPort;
}

/** Electron's utilityProcess exposes `process.parentPort`; a forked child process has `process.send`. */
function notifyParent(message: Record<string, unknown>): void {
  parentPort()?.postMessage(message);
  process.send?.(message);
}

function isShutdownRequest(message: unknown): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { type?: unknown }).type === 'skb:shutdown'
  );
}

/** Lets a parent (Electron main, a test harness) ask for a graceful shutdown over IPC. */
function onParentShutdownRequest(handler: () => void): void {
  parentPort()?.on('message', (event) => {
    if (isShutdownRequest(event.data)) handler();
  });
  if (process.send) {
    process.on('message', (message) => {
      if (isShutdownRequest(message)) handler();
    });
    // The parent went away: there is nobody left to serve.
    process.on('disconnect', handler);
  }
}

function printReady(running: RunningServer, logger: Logger): void {
  logger.info(`${APP_NAME} ${VERSION} is running`, {
    url: running.origin,
    vault: running.context.vault.root,
    mode: running.config.mode,
  });
  // Printed directly (never through the logger) so that the sign-in link is never written to log files.
  process.stdout.write(
    `\n  Open ${APP_NAME}: ${running.bootstrapUrl}\n  Press Ctrl+C to stop.\n\n`,
  );
}

async function main(): Promise<void> {
  let config: ServerConfig;
  try {
    config = resolveConfig({
      argv: process.argv.slice(2),
      env: process.env,
      platform: process.platform,
      homeDir: os.homedir(),
      cwd: process.cwd(),
      bundledWebDir: bundledWebDir(),
    });
  } catch (error) {
    if (error instanceof ConfigError) exitWithMessage(error.message, 2);
    throw error;
  }

  const pretty = config.mode === 'development' || process.stdout.isTTY === true;
  const logger = createLogger({ level: config.logLevel, format: pretty ? 'pretty' : 'json' });

  let running: RunningServer;
  try {
    running = await startServer(config, { logger });
  } catch (error) {
    if (error instanceof StartupError || error instanceof AppError)
      exitWithMessage(error.message, 1);
    throw error;
  }

  printReady(running, logger);
  notifyParent({ type: 'skb:ready', port: running.port, origin: running.origin });
  if (config.openBrowser) openInBrowser(running.bootstrapUrl);

  let stopping = false;
  const stop = (reason: string, code = 0) => {
    if (stopping) return;
    stopping = true;
    logger.info('Shutting down', { reason });
    const force = setTimeout(() => process.exit(code), 5000);
    force.unref();
    running.close().then(
      () => process.exit(code),
      (error: unknown) => {
        logger.error('Error during shutdown', { error });
        process.exit(1);
      },
    );
  };

  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'] as const) {
    process.on(signal, () => stop(signal));
  }
  onParentShutdownRequest(() => stop('parent request'));
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', { error });
    stop('uncaughtException', 1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { error: reason });
    stop('unhandledRejection', 1);
  });
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${APP_NAME} failed to start: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
});
