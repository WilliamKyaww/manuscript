// Runs the desktop shell against the built server: `npm run desktop:dev`.
//  1. builds the server and the web app when they have not been built;
//  2. bundles the shell;
//  3. starts Electron with the environment cleaned of what would make it behave as plain Node.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const serverBundle = path.join(root, 'apps', 'server', 'dist', 'server.mjs');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

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

if (!existsSync(serverBundle)) {
  console.log('[desktop] Building the application first...');
  run(npm, ['run', 'build']);
}
run(npm, ['run', 'build', '--workspace', '@skb/desktop']);

const require = createRequire(import.meta.url);
const electronPath = require('electron');
if (typeof electronPath !== 'string' || !existsSync(electronPath)) {
  console.log('[desktop] Downloading Electron...');
  run(process.execPath, [path.join(root, 'node_modules', 'electron', 'install.js')]);
}

// ELECTRON_RUN_AS_NODE is set by VS Code's extension host and makes Electron behave as plain Node.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electronPath, [path.join(root, 'apps', 'desktop'), ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));
