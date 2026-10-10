import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { APP_NAME, createIdFactory, type IdFactory } from '@skb/core';
import { createApp } from './app';
import type { ServerConfig } from './config/config';
import type { AppContext, RestartControl } from './context';
import { createBackup } from './db/backup';
import { loadMigrations, migrate, pendingMigrations } from './db/migrate';
import { openDatabase, type SqlDatabase } from './db/sqlite';
import { type AppModules, createModules } from './modules/index';
import { recordOpened } from './modules/portability/registry';
import { loadOrCreateToken } from './security/token';
import { type Clock, systemClock } from './shared/clock';
import { createEventBus } from './shared/events';
import type { Logger } from './shared/logger';
import { openVault, type Vault } from './vault/vault';
import { VERSION } from './version';

export interface RunningServer {
  readonly config: ServerConfig;
  readonly port: number;
  /** Origin the server listens on, e.g. `http://127.0.0.1:4317`. */
  readonly origin: string;
  /** One-time sign-in URL for the browser (uses the Vite origin in development). */
  readonly bootstrapUrl: string;
  readonly context: AppContext;
  readonly modules: AppModules;
  /** Settles when the first index reconciliation after start-up has finished. */
  readonly indexed: Promise<void>;
  close(): Promise<void>;
}

export interface StartServerOptions {
  logger: Logger;
  clock?: Clock;
  ids?: IdFactory;
  migrationsDir?: string;
  /** Watch the vault for external edits (default true). */
  watch?: boolean;
  /** How the process can be restarted on another vault; absent in tests. */
  restart?: RestartControl;
}

export class StartupError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StartupError';
  }
}

/** Opens the vault and database, applies migrations and starts listening on loopback. */
export async function startServer(
  config: ServerConfig,
  options: StartServerOptions,
): Promise<RunningServer> {
  const { logger } = options;
  const clock = options.clock ?? systemClock;
  const ids = options.ids ?? createIdFactory({ now: () => clock.now().getTime() });

  const vault: Vault = openVault(config.vaultPath, {
    create: true,
    clock,
    ids,
    appVersion: VERSION,
  });
  let db: SqlDatabase | undefined;
  try {
    db = openDatabase(vault.paths.database);
    const migrations = loadMigrations(options.migrationsDir);
    // A schema change is the one moment the whole database is rewritten: keep how it was.
    const upcoming = pendingMigrations(db, migrations);
    if (upcoming.existing && upcoming.pending.length > 0) {
      const last = upcoming.pending.at(-1)?.name ?? 'migration';
      const backup = createBackup(db, vault.paths.backups, clock.now(), 'migration', last);
      logger.info('Backed up the database before migrating it', { name: backup.name });
    }
    const result = migrate(db, migrations, clock);
    if (result.applied.length > 0)
      logger.info('Applied database migrations', { applied: result.applied });

    try {
      recordOpened(config.dataDir, vault.root, clock.now());
    } catch (error) {
      // The recent list is a convenience; never stop the app for it.
      logger.warn('Could not update the list of recent vaults', { error });
    }

    const token = loadOrCreateToken(config.dataDir, config.authTokenOverride);
    const context: AppContext = {
      config,
      logger,
      clock,
      ids,
      vault,
      db,
      events: createEventBus((error) => logger.error('An event listener failed', { error })),
      version: VERSION,
      startedAt: clock.now(),
      ...(options.restart ? { restart: options.restart } : {}),
    };
    let boundPort = config.port;
    const modules = createModules(context);
    const { app } = createApp(context, modules, { token, getPort: () => boundPort });

    const server = await listen(app.fetch, config, logger);
    boundPort = (server.address() as AddressInfo).port;
    const origin = `http://${config.host}:${boundPort}`;
    const signInOrigin =
      config.mode === 'development' && config.devWebOrigin ? config.devWebOrigin : origin;
    const openedDb = db;
    // Indexing runs after the server is listening, so start-up stays fast on large vaults.
    const indexed = modules.start({ watch: options.watch ?? true }).catch((error) => {
      logger.error('Indexing the vault failed', { error });
    });

    let closing: Promise<void> | undefined;
    return {
      config,
      port: boundPort,
      origin,
      bootstrapUrl: `${signInOrigin}/auth?token=${encodeURIComponent(token)}`,
      context,
      modules,
      indexed,
      close() {
        closing ??= new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections?.();
        })
          .then(() => modules.close())
          .catch((error) => logger.error('Error while stopping', { error }))
          .finally(() => {
            openedDb.close();
            vault.close();
            logger.info(`${APP_NAME} stopped`);
          });
        return closing;
      },
    };
  } catch (error) {
    db?.close();
    vault.close();
    throw error;
  }
}

function listen(
  fetch: (request: Request) => Response | Promise<Response>,
  config: ServerConfig,
  logger: Logger,
): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch, hostname: config.host, port: config.port }) as Server;
    const onError = (error: NodeJS.ErrnoException) => {
      server.close();
      if (error.code === 'EADDRINUSE') {
        reject(
          new StartupError(
            `Port ${config.port} is already in use. Is ${APP_NAME} already running? ` +
              'Close it, or set SKB_PORT to use a different port.',
            { cause: error },
          ),
        );
      } else {
        reject(new StartupError(`Could not start the server: ${error.message}`, { cause: error }));
      }
    };
    server.once('error', onError);
    server.once('listening', () => {
      server.off('error', onError);
      server.on('error', (error) => logger.error('Server error', { error }));
      resolve(server);
    });
  });
}
