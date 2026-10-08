import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// The development server proxies API and sign-in requests to the local Node server.
// The Host header is kept (changeOrigin: false) so the server's Host/Origin checks see the Vite
// origin, which it allows in development mode only (ADR-0005).
// Port 5317 (not Vite's usual 5173) avoids clashing with other Vite projects on this machine; if you
// change it, set SKB_DEV_WEB_ORIGIN for the server to match.
const serverTarget = `http://127.0.0.1:${process.env.SKB_PORT ?? '4317'}`;
const webPort = Number(process.env.SKB_WEB_PORT ?? '5317');

/**
 * pdf.js loads character maps, standard fonts and image decoders at run time (viewer/pdfjs.ts).
 * They are served from node_modules in development and copied to `dist/pdfjs/` in builds.
 */
function pdfjsAssets(): Plugin {
  const root = path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
  const folders = ['cmaps', 'standard_fonts', 'wasm'];
  return {
    name: 'skb-pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (request, response, next) => {
        const relative = decodeURIComponent((request.url ?? '').split('?')[0] ?? '').replace(
          /^\/+/,
          '',
        );
        const file = path.resolve(root, relative);
        const folder = relative.split('/')[0] ?? '';
        if (
          !folders.includes(folder) ||
          !file.startsWith(root + path.sep) ||
          !existsSync(file) ||
          !statSync(file).isFile()
        ) {
          next();
          return;
        }
        response.setHeader(
          'Content-Type',
          file.endsWith('.wasm')
            ? 'application/wasm'
            : file.endsWith('.js')
              ? 'text/javascript'
              : 'application/octet-stream',
        );
        createReadStream(file).pipe(response);
      });
    },
    writeBundle(options) {
      const out = options.dir ?? 'dist';
      for (const folder of folders)
        cpSync(path.join(root, folder), path.join(out, 'pdfjs', folder), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pdfjsAssets()],
  server: {
    host: '127.0.0.1',
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': { target: serverTarget, changeOrigin: false },
      '/auth': { target: serverTarget, changeOrigin: false },
    },
  },
  preview: {
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2023',
  },
});
