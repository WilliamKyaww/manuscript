import { readFileSync } from 'node:fs';

declare const __SKB_VERSION__: string | undefined;

function readPackageVersion(): string {
  try {
    const url = new URL('../package.json', import.meta.url);
    const parsed = JSON.parse(readFileSync(url, 'utf8')) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Application version: injected at build time by esbuild, read from package.json in development. */
export const VERSION: string =
  typeof __SKB_VERSION__ === 'string' ? __SKB_VERSION__ : readPackageVersion();
