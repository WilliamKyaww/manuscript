import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { APP_ID, APP_NAME, DEFAULT_PORT, LEGACY_APP_NAMES, type RunMode } from '@skb/core';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

export interface ServerConfig {
  mode: RunMode;
  /** Always loopback (ADR-0005). */
  host: '127.0.0.1';
  /** 0 asks the operating system for a free port (tests). */
  port: number;
  /** Absolute path of the vault folder. */
  vaultPath: string;
  /** Absolute path of the per-user application data directory (settings, secrets). Never inside the vault. */
  dataDir: string;
  /** Absolute path of the built SPA to serve, or null when the SPA is served elsewhere (Vite in development). */
  webDir: string | null;
  logLevel: LogLevel;
  openBrowser: boolean;
  /** Origin of the Vite dev server, allowed only in development. */
  devWebOrigin: string | null;
  /** Fixed auth token for automation (`SKB_AUTH_TOKEN`); null means use the persisted token. */
  authTokenOverride: string | null;
  /** `SKB_AI_PROVIDER=mock`: a built-in test model answers every AI role (tests and demos). */
  aiMock: boolean;
}

export interface ConfigInput {
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  platform: NodeJS.Platform;
  homeDir: string;
  cwd: string;
  /** Where a bundled SPA would live if present (resolved by the caller). */
  bundledWebDir: string | null;
  /** Whether a path exists (injectable for tests; defaults to the file system). */
  exists?: (path: string) => boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

// 5317 (not Vite's usual 5173) so the dev server does not collide with other local Vite projects.
const DEFAULT_DEV_WEB_ORIGIN = 'http://127.0.0.1:5317';
const MIN_TOKEN_LENGTH = 32;

/** Precedence: CLI flags > SKB_* environment variables > defaults (architecture.md §9). */
export function resolveConfig(input: ConfigInput): ServerConfig {
  const { values } = parseArgs({
    args: [...input.argv],
    options: {
      port: { type: 'string' },
      vault: { type: 'string' },
      'data-dir': { type: 'string' },
      'web-dir': { type: 'string' },
      'log-level': { type: 'string' },
      dev: { type: 'boolean', default: false },
      open: { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  const env = input.env;
  const mode: RunMode = values.dev || env.SKB_MODE === 'development' ? 'development' : 'production';
  const resolvePath = (value: string) => path.resolve(input.cwd, value);

  const port = parsePort(values.port ?? env.SKB_PORT);
  const vaultPath = resolvePath(
    values.vault ?? env.SKB_VAULT ?? defaultVaultPath(mode, input.homeDir, input.cwd, input.exists),
  );
  const dataDir = resolvePath(
    values['data-dir'] ??
      env.SKB_DATA_DIR ??
      defaultDataDir(input.platform, input.env, input.homeDir, input.exists),
  );
  const webDirValue = values['web-dir'] ?? env.SKB_WEB_DIR;
  const webDir =
    webDirValue !== undefined
      ? resolvePath(webDirValue)
      : mode === 'development'
        ? null
        : input.bundledWebDir;
  const logLevel = parseLogLevel(values['log-level'] ?? env.SKB_LOG_LEVEL, mode);
  const devWebOrigin =
    mode === 'development' ? parseOrigin(env.SKB_DEV_WEB_ORIGIN ?? DEFAULT_DEV_WEB_ORIGIN) : null;
  const authTokenOverride = parseTokenOverride(env.SKB_AUTH_TOKEN);
  const aiMock = parseAiProvider(env.SKB_AI_PROVIDER);

  if (isInside(dataDir, vaultPath)) {
    throw new ConfigError(
      `The data directory (${dataDir}) must not be inside the vault (${vaultPath}): it holds secrets.`,
    );
  }

  return {
    mode,
    host: '127.0.0.1',
    port,
    vaultPath,
    dataDir,
    webDir,
    logLevel,
    openBrowser: values.open ?? false,
    devWebOrigin,
    authTokenOverride,
    aiMock,
  };
}

/** The current default, unless only the folder from before the rename exists (ADR-0027). */
function preferExisting(
  current: string,
  legacy: string,
  exists: (path: string) => boolean,
): string {
  return !exists(current) && exists(legacy) ? legacy : current;
}

export function defaultVaultPath(
  mode: RunMode,
  homeDir: string,
  cwd: string,
  exists: (path: string) => boolean = existsSync,
): string {
  if (mode === 'development') return path.join(cwd, '.dev-vault');
  const documents = path.join(homeDir, 'Documents');
  return preferExisting(
    path.join(documents, APP_NAME),
    path.join(documents, LEGACY_APP_NAMES.display),
    exists,
  );
}

export function defaultDataDir(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
  homeDir: string,
  exists: (path: string) => boolean = existsSync,
): string {
  const folder = APP_NAME.replaceAll(' ', '');
  if (platform === 'win32') {
    const base = env.APPDATA ?? path.join(homeDir, 'AppData', 'Roaming');
    return preferExisting(
      path.join(base, folder),
      path.join(base, LEGACY_APP_NAMES.folder),
      exists,
    );
  }
  if (platform === 'darwin') {
    const base = path.join(homeDir, 'Library', 'Application Support');
    return preferExisting(
      path.join(base, folder),
      path.join(base, LEGACY_APP_NAMES.folder),
      exists,
    );
  }
  const base = env.XDG_CONFIG_HOME ?? path.join(homeDir, '.config');
  return preferExisting(path.join(base, APP_ID), path.join(base, LEGACY_APP_NAMES.id), exists);
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_PORT;
  if (!/^\d+$/.test(value))
    throw new ConfigError(`Invalid port "${value}": expected a whole number.`);
  const port = Number(value);
  if (port > 65535) throw new ConfigError(`Invalid port ${port}: must be between 0 and 65535.`);
  return port;
}

function parseLogLevel(value: string | undefined, mode: RunMode): LogLevel {
  if (value === undefined || value === '') return mode === 'development' ? 'debug' : 'info';
  if ((LOG_LEVELS as readonly string[]).includes(value)) return value as LogLevel;
  throw new ConfigError(`Invalid log level "${value}": expected one of ${LOG_LEVELS.join(', ')}.`);
}

function parseOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`Invalid development web origin "${value}".`);
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new ConfigError(`The development web origin must be http on loopback, got "${value}".`);
  }
  return url.origin;
}

function parseTokenOverride(value: string | undefined): string | null {
  if (value === undefined || value === '') return null;
  if (value.length < MIN_TOKEN_LENGTH) {
    throw new ConfigError(`SKB_AUTH_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters long.`);
  }
  return value;
}

function parseAiProvider(value: string | undefined): boolean {
  if (value === undefined || value === '') return false;
  if (value === 'mock') return true;
  throw new ConfigError(`SKB_AI_PROVIDER only accepts "mock" (providers are set in Settings).`);
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
