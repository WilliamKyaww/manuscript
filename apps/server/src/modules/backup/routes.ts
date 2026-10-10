import { createBackupEndpoint, listBackupsEndpoint } from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { BackupService } from './service';

export function registerBackupRoutes(registry: ApiRegistry, backups: BackupService): void {
  registerEndpoint(registry, listBackupsEndpoint, () => backups.list());
  registerEndpoint(registry, createBackupEndpoint, () => backups.backUpNow());
}
