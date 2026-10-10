import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import {
  deleteExportEndpoint,
  EXPORT_DOWNLOAD_ROUTE,
  ExportNameSchema,
  forgetVaultEndpoint,
  getDataOverviewEndpoint,
  inspectVaultEndpoint,
  rescanEndpoint,
  restoreEndpoint,
  startExportEndpoint,
  switchVaultEndpoint,
  ValidationError,
} from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { PortabilityService } from './service';

export function registerPortabilityRoutes(
  registry: ApiRegistry,
  portability: PortabilityService,
): void {
  registerEndpoint(registry, getDataOverviewEndpoint, () => portability.overview());
  registerEndpoint(registry, startExportEndpoint, () => ({ job: portability.startExport() }));
  registerEndpoint(registry, deleteExportEndpoint, ({ params }) => {
    portability.deleteExport(params.name);
    return { ok: true as const };
  });
  registerEndpoint(registry, restoreEndpoint, ({ body }) => ({
    job: portability.startRestore(body),
  }));
  registerEndpoint(registry, rescanEndpoint, () => ({ job: portability.startRescan() }));
  registerEndpoint(registry, inspectVaultEndpoint, ({ body }) => portability.inspect(body.path));
  registerEndpoint(registry, switchVaultEndpoint, ({ body }) => portability.switchTo(body.path));
  registerEndpoint(registry, forgetVaultEndpoint, ({ body }) => {
    portability.forgetVault(body.path);
    return { ok: true as const };
  });

  // The archive itself: a download, streamed from disk, never held in memory.
  registry.app.get(EXPORT_DOWNLOAD_ROUTE, (c) => {
    const parsed = ExportNameSchema.safeParse(c.req.param('name'));
    if (!parsed.success) throw new ValidationError('That is not the name of an export.');
    const file = portability.exportPath(parsed.data);
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(statSync(file).size),
        'Content-Disposition': `attachment; filename="${parsed.data}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  });
}
