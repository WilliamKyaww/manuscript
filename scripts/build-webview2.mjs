// Builds the Windows-only web-pane helper; .NET Framework 4.8 ships with supported Windows versions.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const version = '1.0.4258.31';
const checksum =
  'HlGVwvyP/IWiXAU8K57Vmg59khY3DWMOxMnH4AHusFRy0/vDAjKItXUIVNXiXXaq4CLfSZyNUic1wOIlnPLsPQ==';

export async function buildWebView2() {
  if (process.platform !== 'win32' || process.arch !== 'x64') return;
  const cache = path.join(root, 'apps/desktop/.cache');
  const archive = path.join(cache, `webview2-${version}.nupkg`);
  mkdirSync(cache, { recursive: true });
  if (!existsSync(archive)) {
    const response = await fetch(
      `https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/${version}/microsoft.web.webview2.${version}.nupkg`,
    );
    if (!response.ok) throw new Error(`WebView2 SDK download failed (${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha512').update(bytes).digest('base64') !== checksum)
      throw new Error('WebView2 SDK checksum mismatch.');
    writeFileSync(archive, bytes);
  }
  const bytes = readFileSync(archive);
  if (createHash('sha512').update(bytes).digest('base64') !== checksum)
    throw new Error('Cached WebView2 SDK checksum mismatch.');
  const out = path.join(root, 'apps/desktop/dist/webview2');
  mkdirSync(out, { recursive: true });
  const files = unzipSync(bytes);
  for (const [source, name] of [
    ['lib/net462/Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.Core.dll'],
    ['runtimes/win-x64/native/WebView2Loader.dll', 'WebView2Loader.dll'],
    ['LICENSE.txt', 'WebView2-LICENSE.txt'],
  ]) {
    if (!files[source]) throw new Error(`Missing SDK file: ${source}`);
    writeFileSync(path.join(out, name), files[source]);
  }
  const compiler = path.join(
    process.env.WINDIR || 'C:\\Windows',
    'Microsoft.NET/Framework64/v4.0.30319/csc.exe',
  );
  if (!existsSync(compiler))
    throw new Error('Building the Windows web pane requires .NET Framework 4.8.');
  const sources = path.join(root, 'apps/desktop/native/WebPane');
  const result = spawnSync(
    compiler,
    [
      '/nologo',
      '/target:winexe',
      '/platform:x64',
      '/langversion:5',
      '/optimize+',
      `/out:${path.join(out, 'WebPane.exe')}`,
      `/win32manifest:${path.join(sources, 'app.manifest')}`,
      '/reference:System.Windows.Forms.dll',
      '/reference:System.Drawing.dll',
      '/reference:System.Web.Extensions.dll',
      `/reference:${path.join(out, 'Microsoft.Web.WebView2.Core.dll')}`,
      ...readdirSync(sources)
        .filter((name) => name.endsWith('.cs'))
        .map((name) => path.join(sources, name)),
    ],
    { cwd: root, stdio: 'inherit', windowsHide: true },
  );
  if (result.status !== 0) throw new Error('The Windows web-pane helper did not compile.');
  console.log(`Windows WebView2 helper built (SDK ${version}).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildWebView2();
