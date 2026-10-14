import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  externalUrl,
  isAppUrl,
  isNoteWindowUrl,
  isRevealable,
  pdfFileName,
  restoreWindowState,
  sanitisePick,
  senderAllowed,
  titleBarColour,
  webCommand,
  webPageUrl,
  webViewBounds,
  webViewId,
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

describe('which pages may open in a window of their own (task 23.10)', () => {
  const note = 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7';
  it('is a note of the application, asked for as a note window', () => {
    expect(isNoteWindowUrl(`${ORIGIN}/notes/${note}?window=note`, ORIGIN)).toBe(true);
  });
  it('is nothing else', () => {
    for (const url of [
      `${ORIGIN}/notes/${note}`,
      `${ORIGIN}/notes/${note}?window=other`,
      `${ORIGIN}/settings?window=note`,
      `${ORIGIN}/notes/../settings?window=note`,
      `${ORIGIN}/notes/note_1?window=note`,
      `http://127.0.0.1:9999/notes/${note}?window=note`,
      `https://example.com/notes/${note}?window=note`,
      'javascript:alert(1)',
      'not a url',
    ])
      expect(isNoteWindowUrl(url, ORIGIN), url).toBe(false);
  });
});

describe('the title bar colours a page may ask for', () => {
  it('are hexadecimal colours and nothing else', () => {
    expect(titleBarColour('#f7f5f1')).toBe('#f7f5f1');
    expect(titleBarColour('#FFF')).toBe('#FFF');
    expect(titleBarColour('#12345678')).toBe('#12345678');
    for (const value of ['red', 'url(x)', '#12', '#1234567', 'rgb(0,0,0)', 42, null])
      expect(titleBarColour(value)).toBeNull();
  });
});

describe('the name of a note printed to PDF', () => {
  it('is its title, without what Windows forbids in a file name', () => {
    expect(pdfFileName('Paxos')).toBe('Paxos.pdf');
    expect(pdfFileName('Week 1: Paxos / Raft?')).toBe('Week 1 Paxos Raft.pdf');
    expect(pdfFileName('Ends with dots...')).toBe('Ends with dots.pdf');
    expect(pdfFileName('a\u0000b')).toBe('a b.pdf');
    expect(pdfFileName('   ')).toBe('Note.pdf');
    expect(pdfFileName(undefined)).toBe('Note.pdf');
    expect(pdfFileName('x'.repeat(500))).toHaveLength(124);
  });
});

describe('the web pane beside a note (Phase 26)', () => {
  it('shows pages on the web, never the application or anything that is not http(s)', () => {
    expect(webPageUrl('https://www.sciencedirect.com/science/article/pii/S0168', ORIGIN)).toBe(
      'https://www.sciencedirect.com/science/article/pii/S0168',
    );
    for (const refused of [
      `${ORIGIN}/api/health`,
      'file:///C:/Windows/win.ini',
      'javascript:alert(1)',
      'mailto:someone@example.org',
      'https://user:secret@example.org/',
      `https://example.org/${'a'.repeat(9000)}`,
      42,
      null,
    ])
      expect(webPageUrl(refused, ORIGIN), String(refused).slice(0, 40)).toBeNull();
    // Without a server yet, the web is still the web.
    expect(webPageUrl('http://example.org', null)).toBe('http://example.org/');
  });

  it('names tabs plainly', () => {
    expect(webViewId('tlz3k9a1')).toBe('tlz3k9a1');
    for (const refused of ['', 'a b', '../x', 'x'.repeat(41), 7, undefined])
      expect(webViewId(refused)).toBeNull();
  });

  it('places the view in whole pixels, scaled by the page zoom, never off the window', () => {
    expect(webViewBounds({ x: 10.4, y: 20.6, width: 300, height: 400 }, 1)).toEqual({
      x: 10,
      y: 21,
      width: 300,
      height: 400,
    });
    expect(webViewBounds({ x: 10, y: 20, width: 300, height: 400 }, 1.25)).toEqual({
      x: 13,
      y: 25,
      width: 375,
      height: 500,
    });
    expect(webViewBounds({ x: -5, y: -1, width: 100, height: 100 }, 1)).toMatchObject({
      x: 0,
      y: 0,
    });
    for (const refused of [
      null,
      'x',
      { x: 0, y: 0, width: 100 },
      { x: 0, y: 0, width: Number.NaN, height: 1 },
      { x: 0, y: 0, width: 1e9, height: 1 },
    ])
      expect(webViewBounds(refused, 1)).toBeNull();
  });

  it('accepts only the commands of the toolbar', () => {
    for (const command of ['back', 'forward', 'reload', 'stop', 'load'])
      expect(webCommand(command)).toBe(command);
    expect(webCommand('print')).toBeNull();
  });
});
