import type { IdFactory } from '@skb/core';
import type { ServerConfig } from './config/config';
import type { SqlDatabase } from './db/sqlite';
import type { Clock } from './shared/clock';
import type { EventBus } from './shared/events';
import type { Logger } from './shared/logger';
import type { Vault } from './vault/vault';

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
}
