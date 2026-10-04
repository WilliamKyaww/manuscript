// Bundles the server into a single ESM file and assembles a self-contained dist folder:
//   apps/server/dist/server.mjs   (+ source map)
//   apps/server/dist/migrations/  (SQL migrations read at runtime)
//   apps/server/dist/web/         (built SPA, if apps/web/dist exists)
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const serverDir = path.join(root, 'apps', 'server');
const outDir = path.join(serverDir, 'dist');
const webDist = path.join(root, 'apps', 'web', 'dist');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

rmSync(outDir, { recursive: true, force: true });

await build({
  entryPoints: [path.join(serverDir, 'src', 'main.ts')],
  outfile: path.join(outDir, 'server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  legalComments: 'linked',
  define: { __SKB_VERSION__: JSON.stringify(version) },
  // Some dependencies may use require(); provide it inside the ESM bundle.
  banner: {
    js: "import { createRequire as __skbCreateRequire } from 'node:module'; const require = __skbCreateRequire(import.meta.url);",
  },
  logLevel: 'warning',
});

cpSync(path.join(serverDir, 'src', 'db', 'migrations'), path.join(outDir, 'migrations'), {
  recursive: true,
});

if (existsSync(path.join(webDist, 'index.html'))) {
  cpSync(webDist, path.join(outDir, 'web'), { recursive: true });
  console.log(`Server ${version} bundled with the web app -> ${path.relative(root, outDir)}`);
} else {
  console.warn(
    `Server ${version} bundled WITHOUT the web app (run "npm run build" from the repository root).`,
  );
}
