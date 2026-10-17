import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { UnavailableError, ValidationError } from '@skb/core';
import type { EntriesService } from '../entries';

const MIB = 1024 * 1024;
export const LAYOUT_INPUT_LIMIT = 16 * MIB;
const OUTPUT_LIMIT = 64 * MIB;
const DEADLINE_MS = 45_000;
/** One conversion runs; this many more may wait for their turn before a request is turned away. */
const MAX_WAITING = 3;
const TEMPORARY_PREFIX = 'manuscript-preview-';
const STALE_AFTER_MS = 60 * 60 * 1000;
/**
 * Named explicitly, because LibreOffice otherwise guesses the format and shows a damaged OOXML file
 * as plain text. Old .doc files stay guessed: Word names RTF, HTML and OOXML files .doc as well.
 */
const INPUT_FILTERS: Record<string, string | undefined> = {
  '.docx': 'MS Word 2007 XML',
  '.xlsx': 'Calc MS Excel 2007 XML',
  '.doc': undefined,
};

export function libreOfficePath(): string | null {
  const programFiles = [process.env.ProgramFiles, process.env.ProgramW6432].filter(
    (folder): folder is string => Boolean(folder),
  );
  const candidates = [
    process.env.SKB_LIBREOFFICE_PATH,
    ...programFiles.map((folder) => path.join(folder, 'LibreOffice/program/soffice.exe')),
    'C:/Program Files/LibreOffice/program/soffice.exe',
    'C:/Program Files (x86)/LibreOffice/program/soffice.exe',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/usr/bin/libreoffice',
    '/usr/bin/soffice',
  ];
  return (
    candidates.find(
      (candidate) => candidate && path.isAbsolute(candidate) && existsSync(candidate),
    ) ?? null
  );
}

export interface LayoutOptions {
  /** The office program; defaults to the one found on this computer, `null` meaning none. */
  executable?: string | null;
  /** Ends the conversion (and its child processes) when the request is abandoned. */
  signal?: AbortSignal;
  deadlineMs?: number;
}

type Stopped = 'timeout' | 'cancelled';
export class ConversionStopped extends Error {
  constructor(readonly reason: Stopped) {
    super(reason);
  }
}

/**
 * Ends a process and everything it started. `soffice` is only a launcher (a script on macOS and
 * Linux, a wrapper on Windows); ending the launcher alone can leave the real office process
 * running, holding the profile folder and a CPU core.
 */
function killTree(child: ChildProcess): Promise<void> {
  const { pid } = child;
  if (pid === undefined || child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();
  if (process.platform !== 'win32') {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
    return Promise.resolve();
  }
  const taskkill = path.join(process.env.SystemRoot ?? 'C:/Windows', 'System32/taskkill.exe');
  return new Promise((resolve) => {
    execFile(
      taskkill,
      ['/PID', String(pid), '/T', '/F'],
      { windowsHide: true, timeout: 10_000 },
      (error) => {
        if (error) child.kill();
        resolve();
      },
    );
  });
}

/** Resolves when the launcher and everything under it has ended. Exported for the process-tree test. */
export function runOffice(
  executable: string,
  args: string[],
  deadlineMs: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Its own process group on POSIX, so that the whole group can be ended at once.
    const child = spawn(executable, args, {
      windowsHide: true,
      stdio: 'ignore',
      detached: process.platform !== 'win32',
    });
    let stopped: ConversionStopped | undefined;
    let killed: Promise<void> = Promise.resolve();
    const stop = (reason: Stopped) => {
      if (stopped) return;
      stopped = new ConversionStopped(reason);
      killed = killTree(child);
    };
    const timer = setTimeout(() => stop('timeout'), deadlineMs);
    const onAbort = () => stop('cancelled');
    signal?.addEventListener('abort', onAbort, { once: true });
    const settle = (error?: Error) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      void killed.then(() => (error ? reject(error) : resolve()));
    };
    child.once('error', (error) => settle(error));
    child.once('exit', (code) =>
      settle(
        stopped ??
          (code === 0 ? undefined : new Error(`LibreOffice stopped with exit code ${code}`)),
      ),
    );
    if (signal?.aborted) onAbort();
  });
}

// One conversion at a time keeps a student's laptop usable; the others wait their turn in order.
let tail: Promise<void> = Promise.resolve();
let pending = 0;
/** Exported for the queue test. */
export async function takeTurn(signal: AbortSignal | undefined): Promise<() => void> {
  if (pending > MAX_WAITING)
    throw new UnavailableError(
      'Several page layouts are being prepared. Please try again in a moment.',
    );
  pending++;
  const previous = tail;
  let open = () => {};
  tail = new Promise<void>((resolve) => {
    open = resolve;
  });
  // The count is given back at once; the place in line is handed on when the one ahead is done.
  let counted = true;
  const leave = () => {
    if (counted) pending--;
    counted = false;
  };
  const release = () => {
    leave();
    open();
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => reject(new ConversionStopped('cancelled'));
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });
      void previous.then(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      });
    });
  } catch (error) {
    leave();
    void previous.then(open);
    throw error;
  }
  return release;
}

/** Leftovers of a crash, or of a file Windows still held at the time, are removed by the next run. */
async function sweepStale(): Promise<void> {
  const root = tmpdir();
  for (const name of await readdir(root).catch(() => [])) {
    if (!name.startsWith(TEMPORARY_PREFIX)) continue;
    const folder = path.join(root, name);
    const info = await stat(folder).catch(() => null);
    if (info && Date.now() - info.mtimeMs > STALE_AFTER_MS)
      await rm(folder, { recursive: true, force: true }).catch(() => undefined);
  }
}

const PROFILE_SETTINGS = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>1</value></prop></item>
</oor:items>`;

/** A private profile avoids attaching to a user's running office session or changing its settings. */
export async function renderFileLayout(
  entries: EntriesService,
  requested: string,
  options: LayoutOptions = {},
): Promise<Uint8Array> {
  const { signal, deadlineMs = DEADLINE_MS } = options;
  const executable = options.executable === undefined ? libreOfficePath() : options.executable;
  const file = entries.file(requested);
  const extension = path.extname(file.path).toLowerCase();
  if (!(extension in INPUT_FILTERS))
    throw new ValidationError('Page layout is available for Word documents and Excel workbooks.');
  if (!executable)
    throw new ValidationError(
      'Page layout needs LibreOffice installed on this computer. Install LibreOffice, then try again. Reading view still works.',
    );
  if (file.sizeBytes === 0)
    throw new ValidationError('This file is empty, so there is no page layout to show.');
  if (file.sizeBytes > LAYOUT_INPUT_LIMIT)
    throw new ValidationError('This document is too large for Page layout (16 MB maximum).');
  const release = await takeTurn(signal).catch((error) => {
    if (error instanceof ConversionStopped) throw cancelled();
    throw error;
  });
  let temporary: string | undefined;
  try {
    await sweepStale();
    temporary = await mkdtemp(path.join(tmpdir(), TEMPORARY_PREFIX));
    const profile = path.join(temporary, 'profile');
    await mkdir(path.join(profile, 'user'), { recursive: true });
    await writeFile(path.join(profile, 'user/registrymodifications.xcu'), PROFILE_SETTINGS);
    const input = path.join(temporary, `document${extension}`);
    await copyFile(file.absolute, input);
    // The file may have grown between the check above and the copy.
    if ((await stat(input)).size > LAYOUT_INPUT_LIMIT)
      throw new ValidationError('This document is too large for Page layout (16 MB maximum).');
    await runOffice(
      executable,
      [
        `-env:UserInstallation=${pathToFileURL(profile).href}`,
        '--headless',
        '--nologo',
        '--nodefault',
        '--norestore',
        ...(INPUT_FILTERS[extension] ? [`--infilter=${INPUT_FILTERS[extension]}`] : []),
        '--convert-to',
        'pdf',
        '--outdir',
        temporary,
        input,
      ],
      deadlineMs,
      signal,
    );
    const output = path.join(temporary, 'document.pdf');
    if ((await stat(output)).size > OUTPUT_LIMIT)
      throw new ValidationError(
        'The page layout of this document is too large to show (64 MB maximum). Reading view and the original file remain available.',
      );
    const bytes = await readFile(output);
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('LibreOffice wrote no PDF');
    return bytes;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    if (error instanceof ConversionStopped)
      throw error.reason === 'cancelled'
        ? cancelled()
        : new UnavailableError(
            `Page layout took longer than ${Math.round(deadlineMs / 1000)} seconds, so it was stopped. The document may be very large or complex. Reading view and the original file remain available.`,
            { cause: error },
          );
    throw new UnavailableError(
      'Page layout could not be prepared. The file may be damaged or password-protected. Reading view and the original file remain available.',
      { cause: error },
    );
  } finally {
    release();
    // Not worth failing the preview for: the next conversion sweeps whatever Windows still holds.
    if (temporary)
      await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
        () => undefined,
      );
  }
}

/** Nobody is left to read this: it only keeps an abandoned request out of the error log. */
function cancelled(): ValidationError {
  return new ValidationError('Page layout was cancelled.');
}
