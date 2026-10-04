import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { MiddlewareHandler } from 'hono';
import { resolveInVault } from '../vault/paths';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

function fileResponse(file: string, cacheControl: string, method: string): Response {
  const contentType = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  const headers = { 'Content-Type': contentType, 'Cache-Control': cacheControl };
  return new Response(method === 'HEAD' ? null : readFileSync(file), { status: 200, headers });
}

/**
 * Serves the built SPA (production and desktop modes). Hashed assets are cached forever; HTML is
 * always revalidated. Unknown non-file paths fall back to `index.html` for client-side routing.
 */
export function staticSite(webDir: string): MiddlewareHandler {
  const root = path.resolve(webDir);
  const indexFile = path.join(root, 'index.html');

  return async (c, next) => {
    const method = c.req.method;
    const requestPath = c.req.path;
    if (
      (method !== 'GET' && method !== 'HEAD') ||
      requestPath.startsWith('/api/') ||
      requestPath === '/auth'
    ) {
      await next();
      return;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(requestPath);
    } catch {
      await next();
      return;
    }

    if (decoded !== '/') {
      let file: string | undefined;
      try {
        file = resolveInVault(root, decoded.slice(1), { allowInternal: true, checkLinks: false });
      } catch {
        file = undefined;
      }
      if (file && existsSync(file) && statSync(file).isFile()) {
        const immutable = decoded.startsWith('/assets/');
        return fileResponse(
          file,
          immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
          method,
        );
      }
      // A missing file with an extension is a genuine 404, not a client-side route.
      if (path.extname(decoded) !== '') {
        await next();
        return;
      }
    }

    if (!existsSync(indexFile)) {
      await next();
      return;
    }
    return fileResponse(indexFile, 'no-cache', method);
  };
}
