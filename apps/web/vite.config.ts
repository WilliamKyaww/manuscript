import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The development server proxies API and sign-in requests to the local Node server.
// The Host header is kept (changeOrigin: false) so the server's Host/Origin checks see the Vite
// origin, which it allows in development mode only (ADR-0005).
// Port 5317 (not Vite's usual 5173) avoids clashing with other Vite projects on this machine; if you
// change it, set SKB_DEV_WEB_ORIGIN for the server to match.
const serverTarget = `http://127.0.0.1:${process.env.SKB_PORT ?? '4317'}`;
const webPort = Number(process.env.SKB_WEB_PORT ?? '5317');

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
