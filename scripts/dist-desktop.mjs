// The Windows installer: `npm run desktop:dist` → apps/desktop/release/Manuscript-Setup-<version>.exe.
// Builds the application and the shell, then runs electron-builder (NSIS) with apps/desktop's
// configuration. The version is the repository's. Without CSC_LINK (a code-signing certificate) the
// installer is unsigned and says so.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const desktop = path.join(root, 'apps', 'desktop');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// SKB_DIST_VERSION builds an installer with another version: to check that an update installs over a
// release in place (docs/guide/installing.md).
const version =
  process.env.SKB_DIST_VERSION ??
  JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;

const quote = (part) => (/\s/u.test(part) ? `"${part}"` : part);
const run = (command, args, options = {}) => {
  // A shell is needed for .cmd files on Windows; the line is built from fixed strings and passed as
  // one string (passing an args array with shell: true is deprecated, DEP0190).
  const result =
    process.platform === 'win32'
      ? spawnSync([command, ...args].map(quote).join(' '), {
          cwd: root,
          stdio: 'inherit',
          shell: true,
          ...options,
        })
      : spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run(npm, ['run', 'build']);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
if (!env.CSC_LINK) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  console.log('[dist] No CSC_LINK: the installer will not be signed.');
}
const builder = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder',
);
run(
  builder,
  [
    '--win',
    'nsis',
    '--x64',
    '--config',
    path.join(desktop, 'electron-builder.yml'),
    `-c.extraMetadata.version=${version}`,
    '--publish',
    'never',
  ],
  { cwd: desktop, env },
);
console.log(
  `[dist] Installer: apps${path.sep}desktop${path.sep}release${path.sep}Manuscript-Setup-${version}.exe`,
);
