import { APP_ID, healthEndpoint, pingEndpoint } from '@skb/core';
import type { AppContext } from '../../context';
import { migrationStatus } from '../../db/migrate';
import { sqliteVersion } from '../../db/sqlite';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';

export function registerSystemRoutes(registry: ApiRegistry, ctx: AppContext): void {
  registerEndpoint(registry, pingEndpoint, () => ({ app: APP_ID, ok: true }) as const);

  registerEndpoint(registry, healthEndpoint, () => {
    const now = ctx.clock.now();
    let databaseOk = true;
    let status = { appliedMigrations: 0, latestMigration: null as string | null };
    let version = 'unknown';
    try {
      status = migrationStatus(ctx.db);
      version = sqliteVersion(ctx.db);
    } catch (error) {
      databaseOk = false;
      ctx.logger.error('Database health check failed', { error });
    }
    return {
      status: 'ok' as const,
      version: ctx.version,
      mode: ctx.config.mode,
      startedAt: ctx.startedAt.toISOString(),
      uptimeSeconds: Math.max(0, Math.round((now.getTime() - ctx.startedAt.getTime()) / 1000)),
      vault: { id: ctx.vault.id, name: ctx.vault.name, path: ctx.vault.root },
      database: { ok: databaseOk, sqliteVersion: version, ...status },
    };
  });
}
