// Bundles the desktop shell: the main process (ESM) and the preload script (CommonJS, because a
// sandboxed preload cannot be a module) into apps/desktop/dist. Electron itself is not bundled.
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { buildWebView2 } from './build-webview2.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const desktop = path.join(root, 'apps', 'desktop');
const out = path.join(desktop, 'dist');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

rmSync(out, { recursive: true, force: true });

await build({
  entryPoints: { main: path.join(desktop, 'src', 'main.ts') },
  outdir: out,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['electron'],
  sourcemap: true,
  define: { __SKB_VERSION__: JSON.stringify(version) },
  banner: {
    js: "import { createRequire as __skbCreateRequire } from 'node:module'; const require = __skbCreateRequire(import.meta.url);",
  },
  logLevel: 'warning',
});

await build({
  entryPoints: { preload: path.join(desktop, 'src', 'preload.ts') },
  outdir: out,
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'warning',
});

await buildWebView2();
console.log(`Desktop shell ${version} bundled -> ${path.relative(root, out)}`);
