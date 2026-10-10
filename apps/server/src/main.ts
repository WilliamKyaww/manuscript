import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_NAME, AppError, LEGACY_APP_NAMES } from '@skb/core';
import { ConfigError, resolveConfig, type ServerConfig } from './config/config';
import { activeVault } from './modules/portability/registry';
import { openInBrowser } from './platform/browser';
import { type RunningServer, StartupError, startServer } from './server';
import { createDeferredLogFile } from './shared/log-file';
import { createLogger, type Logger } from './shared/logger';
import { VERSION } from './version';

/** The built SPA is copied next to the server bundle (`dist/web`) by the build script. */
function bundledWebDir(): string | null {
  const dir = fileURLToPath(new URL('./web/', import.meta.url));
  return existsSync(path.join(dir, 'index.html')) ? dir : null;
}

/** `EX_TEMPFAIL`: "try again" — what a launcher takes to mean "start me once more". */
const RESTART_EXIT_CODE = 75;

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
  if (path.basename(running.context.vault.root) === LEGACY_APP_NAMES.display) {
    logger.info(
      `Using the vault folder from before the rename to ${APP_NAME}. To use the new name, close the ` +
        `app and rename the folder to "${APP_NAME}" (ADR-0027).`,
      { vault: running.context.vault.root },
    );
  }
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
      activeVault,
    });
  } catch (error) {
    if (error instanceof ConfigError) exitWithMessage(error.message, 2);
    throw error;
  }

  const pretty = config.mode === 'development' || process.stdout.isTTY === true;
  const logFile = createDeferredLogFile();
  const logger = createLogger({
    level: config.logLevel,
    format: pretty ? 'pretty' : 'json',
    file: (line) => logFile.write(line),
  });

  // The launcher (run-web) and the desktop shell relaunch the process on this exit code, which is how
  // opening another vault works: the vault is chosen when the process starts.
  let requestStop: (reason: string, code?: number) => void = () => {};
  const restart = {
    available: process.env.SKB_RESTARTABLE === '1',
    request: () => {
      // Let the response that asked for the restart reach the browser first.
      setTimeout(() => requestStop('restart requested', RESTART_EXIT_CODE), 400).unref();
    },
  };

  let running: RunningServer;
  try {
    running = await startServer(config, { logger, restart, logFile });
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

  requestStop = stop;
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
