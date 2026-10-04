import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, type ConfigInput, resolveConfig } from './config';

const home = path.resolve('/home/will');
const cwd = path.resolve('/repo');

function input(overrides: Partial<ConfigInput> = {}): ConfigInput {
  return {
    argv: [],
    env: {},
    platform: 'linux',
    homeDir: home,
    cwd,
    bundledWebDir: path.resolve('/repo/dist/web'),
    ...overrides,
  };
}

describe('resolveConfig', () => {
  it('uses production defaults', () => {
    const config = resolveConfig(input());
    expect(config.mode).toBe('production');
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(4317);
    expect(config.vaultPath).toBe(path.join(home, 'Documents', 'Study Knowledge Base'));
    expect(config.dataDir).toBe(path.join(home, '.config', 'study-knowledge-base'));
    expect(config.webDir).toBe(path.resolve('/repo/dist/web'));
    expect(config.logLevel).toBe('info');
    expect(config.openBrowser).toBe(false);
    expect(config.devWebOrigin).toBeNull();
    expect(config.authTokenOverride).toBeNull();
  });

  it('uses development defaults with --dev', () => {
    const config = resolveConfig(input({ argv: ['--dev'] }));
    expect(config.mode).toBe('development');
    expect(config.vaultPath).toBe(path.join(cwd, '.dev-vault'));
    expect(config.webDir).toBeNull();
    expect(config.logLevel).toBe('debug');
    expect(config.devWebOrigin).toBe('http://127.0.0.1:5317');
  });

  it('places app data in %APPDATA% on Windows', () => {
    const appData = path.resolve('/Users/will/AppData/Roaming');
    const config = resolveConfig(input({ platform: 'win32', env: { APPDATA: appData } }));
    expect(config.dataDir).toBe(path.join(appData, 'StudyKnowledgeBase'));
  });

  it('lets CLI flags win over environment variables', () => {
    const config = resolveConfig(
      input({
        argv: ['--port', '5000', '--vault', 'vault-a', '--log-level', 'warn', '--open'],
        env: { SKB_PORT: '6000', SKB_VAULT: 'vault-b', SKB_LOG_LEVEL: 'error' },
      }),
    );
    expect(config.port).toBe(5000);
    expect(config.vaultPath).toBe(path.join(cwd, 'vault-a'));
    expect(config.logLevel).toBe('warn');
    expect(config.openBrowser).toBe(true);
  });

  it('reads environment variables when no flags are given', () => {
    const config = resolveConfig(
      input({ env: { SKB_PORT: '0', SKB_DATA_DIR: 'data', SKB_WEB_DIR: 'web' } }),
    );
    expect(config.port).toBe(0);
    expect(config.dataDir).toBe(path.join(cwd, 'data'));
    expect(config.webDir).toBe(path.join(cwd, 'web'));
  });

  it('rejects invalid values with clear messages', () => {
    expect(() => resolveConfig(input({ env: { SKB_PORT: 'abc' } }))).toThrow(ConfigError);
    expect(() => resolveConfig(input({ env: { SKB_PORT: '70000' } }))).toThrow(
      /between 0 and 65535/,
    );
    expect(() => resolveConfig(input({ env: { SKB_LOG_LEVEL: 'loud' } }))).toThrow(/log level/);
    expect(() => resolveConfig(input({ env: { SKB_AUTH_TOKEN: 'short' } }))).toThrow(/at least 32/);
    expect(() => resolveConfig(input({ argv: ['--unknown'] }))).toThrow();
  });

  it('refuses a data directory inside the vault', () => {
    expect(() =>
      resolveConfig(input({ env: { SKB_VAULT: 'vault', SKB_DATA_DIR: 'vault/.secrets' } })),
    ).toThrow(/must not be inside the vault/);
  });

  it('only allows loopback http development origins', () => {
    expect(() =>
      resolveConfig(input({ argv: ['--dev'], env: { SKB_DEV_WEB_ORIGIN: 'http://evil.example' } })),
    ).toThrow(/loopback/);
  });
});
