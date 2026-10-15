// An unpacked desktop build: `npm run desktop:build` → apps/desktop/release/<platform>-unpacked.
// Electron's own distribution with the application laid out as it documents ("Application
// Distribution", manual packaging): `resources/app` holds the shell, `resources/server` the server
// bundle with its web app. The installer (NSIS, Phase 19) wraps exactly this layout.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const quote = (part) => (/\s/u.test(part) ? `"${part}"` : part);

const run = (command, args) => {
  // A shell is needed for npm.cmd on Windows; the line is built from fixed strings and passed as
  // one string (passing an args array with shell: true is deprecated, DEP0190).
  const result =
    process.platform === 'win32'
      ? spawnSync([command, ...args].map(quote).join(' '), {
          cwd: root,
          stdio: 'inherit',
          shell: true,
        })
      : spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(npm, ['run', 'build']);
run(npm, ['run', 'build', '--workspace', '@skb/desktop']);

const require = createRequire(import.meta.url);
const electronPath = require('electron');
if (typeof electronPath !== 'string' || !existsSync(electronPath)) {
  run(process.execPath, [path.join(root, 'node_modules', 'electron', 'install.js')]);
}
const electronDist = path.dirname(require('electron'));

const out = path.join(root, 'apps', 'desktop', 'release', `${process.platform}-unpacked`);
rmSync(out, { recursive: true, force: true });
mkdirSync(path.dirname(out), { recursive: true });
cpSync(electronDist, out, { recursive: true });

// The executable carries the application's name; Electron treats an executable not called
// "electron" as a packaged application.
const exe = process.platform === 'win32' ? 'electron.exe' : 'electron';
const named = process.platform === 'win32' ? 'Manuscript.exe' : 'Manuscript';
renameSync(path.join(out, exe), path.join(out, named));

const resources = path.join(out, 'resources');
rmSync(path.join(resources, 'default_app.asar'), { force: true });
const app = path.join(resources, 'app');
mkdirSync(app, { recursive: true });
const dist = path.join(root, 'apps', 'desktop', 'dist');
cpSync(path.join(dist, 'main.mjs'), path.join(app, 'main.mjs'));
cpSync(path.join(dist, 'preload.cjs'), path.join(app, 'preload.cjs'));
if (existsSync(path.join(dist, 'webview2')))
  cpSync(path.join(dist, 'webview2'), path.join(resources, 'webview2'), { recursive: true });
writeFileSync(
  path.join(app, 'package.json'),
  `${JSON.stringify({ name: 'manuscript', productName: 'Manuscript', version, type: 'module', main: 'main.mjs' }, null, 2)}\n`,
);
cpSync(path.join(root, 'apps', 'server', 'dist'), path.join(resources, 'server'), {
  recursive: true,
  // Source maps of the server are for developers.
  filter: (source) => !source.endsWith('.map'),
});

console.log(`Unpacked desktop build ${version} -> ${path.relative(root, out)}${path.sep}${named}`);
