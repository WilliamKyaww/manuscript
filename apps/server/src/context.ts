import type { IdFactory } from '@skb/core';
import type { ServerConfig } from './config/config';
import type { SqlDatabase } from './db/sqlite';
import type { Clock } from './shared/clock';
import type { EventBus } from './shared/events';
import type { Logger } from './shared/logger';
import type { Vault } from './vault/vault';

/**
 * How the running process can be asked to start again (to open another vault). `available` is
 * true only when something watches the process and relaunches it: the launcher or the desktop shell.
 */
export interface RestartControl {
  readonly available: boolean;
  request(): void;
}

/**
 * Explicit dependency container passed to route and service factories (architecture.md §3).
 * Tests build one with an in-memory database, a temporary vault and a fixed clock.
 */
export interface AppContext {
  readonly config: ServerConfig;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly ids: IdFactory;
  readonly vault: Vault;
  readonly db: SqlDatabase;
  readonly events: EventBus;
  readonly version: string;
  readonly startedAt: Date;
  readonly restart?: RestartControl;
}
