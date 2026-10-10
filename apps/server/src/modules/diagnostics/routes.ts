import { DIAGNOSTICS_BUNDLE_PATH, getDiagnosticsEndpoint, logsEndpoint } from '@skb/core';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { DiagnosticsService } from './service';

export function registerDiagnosticsRoutes(
  registry: ApiRegistry,
  diagnostics: DiagnosticsService,
): void {
  registerEndpoint(registry, getDiagnosticsEndpoint, () => diagnostics.report());
  registerEndpoint(registry, logsEndpoint, ({ query }) => diagnostics.logs(query));
  registry.app.get(DIAGNOSTICS_BUNDLE_PATH, () => {
    const { name, bytes } = diagnostics.bundle();
    return new Response(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  });
}
