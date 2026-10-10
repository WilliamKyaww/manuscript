import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  externalUrl,
  isAppUrl,
  isRevealable,
  restoreWindowState,
  sanitisePick,
  senderAllowed,
} from './policy';

const ORIGIN = 'http://127.0.0.1:51234';

describe('which addresses the window may show', () => {
  it('is only the application, whatever the path', () => {
    expect(isAppUrl('http://127.0.0.1:51234/notes/x?line=3#a', ORIGIN)).toBe(true);
    for (const other of [
      'http://127.0.0.1:51235/',
      'http://localhost:51234/',
      'https://127.0.0.1:51234/',
      'http://127.0.0.1.evil.example:51234/',
      'file:///C:/Windows/win.ini',
      'not a url',
    ])
      expect(isAppUrl(other, ORIGIN), other).toBe(false);
  });
});

describe('which links are opened outside the application', () => {
  it('are plain web links, without credentials', () => {
    expect(externalUrl('https://example.org/a?b=c')).toBe('https://example.org/a?b=c');
    expect(externalUrl('http://example.org')).toBe('http://example.org/');
    for (const refused of [
      'file:///C:/Windows/System32/calc.exe',
      'javascript:alert(1)',
      'ms-msdt:/id PCWDiagnostic',
      'vscode://file/x',
      'https://user:pass@example.org/',
      'https://',
      'example.org',
      '',
    ])
      expect(externalUrl(refused), refused).toBeNull();
  });
});

describe('what may be shown in the file manager', () => {
  const vault = path.resolve('/study/vault');
  const data = path.resolve('/study/data');
  it('is the vault, the data folder and what is inside them', () => {
    expect(isRevealable(vault, [vault, data])).toBe(true);
    expect(isRevealable(path.join(vault, 'Notes', 'a.md'), [vault, data])).toBe(true);
    expect(isRevealable(path.join(data, 'exports'), [vault, data])).toBe(true);
    for (const refused of [
      path.resolve('/study'),
      path.resolve('/study/vault-other'),
      path.join(vault, '..', 'secrets'),
      'relative/path',
      '',
      `${vault}\0`,
      42,
      null,
    ])
      expect(isRevealable(refused, [vault, data]), String(refused)).toBe(false);
  });
});

describe('what a picker may be asked for', () => {
  it('keeps what a picker takes and drops the rest', () => {
    expect(
      sanitisePick({
        title: 'x'.repeat(300),
        multiple: true,
        filters: [
          { name: 'Archives', extensions: ['zip', '../etc', 'ZIP', '.zip'] },
          { name: 'Bad', extensions: ['*'] },
          'nonsense',
        ],
        properties: ['openDirectory', 'dontAddToRecent'],
      }),
    ).toEqual({
      title: 'x'.repeat(100),
      multiple: true,
      filters: [{ name: 'Archives', extensions: ['zip', 'ZIP'] }],
    });
    expect(sanitisePick(null)).toEqual({});
    expect(sanitisePick('x')).toEqual({});
  });
});

describe('who may talk to the main process', () => {
  it('is a page of the application, once the server is known', () => {
    expect(senderAllowed(`${ORIGIN}/settings`, ORIGIN)).toBe(true);
    expect(senderAllowed('https://evil.example/', ORIGIN)).toBe(false);
    expect(senderAllowed(undefined, ORIGIN)).toBe(false);
    expect(senderAllowed(`${ORIGIN}/`, null)).toBe(false);
  });
});

describe('where the window opens', () => {
  const displays = [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 0, width: 1280, height: 1024 },
  ];
  it('is where it was, when that is still on a screen', () => {
    expect(
      restoreWindowState({ x: 100, y: 80, width: 1200, height: 800, maximised: true }, displays),
    ).toEqual({ x: 100, y: 80, width: 1200, height: 800, maximised: true });
    expect(
      restoreWindowState({ x: 2000, y: 40, width: 1000, height: 700 }, displays),
    ).toMatchObject({
      x: 2000,
      y: 40,
    });
  });

  it('is wherever the system puts it, when the screen it was on has gone', () => {
    const state = restoreWindowState({ x: 5000, y: 40, width: 1200, height: 800 }, displays);
    expect(state).toEqual({ width: 1200, height: 800, maximised: false });
    expect(restoreWindowState({ x: -3000, y: -3000, width: 1200, height: 800 }, displays).x).toBe(
      undefined,
    );
  });

  it('is never smaller than the application can use, nor larger than a screen, nor garbage', () => {
    expect(restoreWindowState({ width: 100, height: 50 }, displays)).toMatchObject({
      width: 900,
      height: 600,
    });
    expect(restoreWindowState({ width: 90000, height: 90000 }, displays)).toMatchObject({
      width: 1920,
      height: 1080,
    });
    expect(restoreWindowState('nonsense', displays)).toEqual({
      width: 1360,
      height: 860,
      maximised: false,
    });
    expect(restoreWindowState({ x: 'a', y: NaN, width: 'b' }, displays)).toEqual({
      width: 1360,
      height: 860,
      maximised: false,
    });
  });
});
