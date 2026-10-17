import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { ValidationError } from '@skb/core';
import type { EntriesService } from '../entries';

const execute = promisify(execFile);
let active = false;
export function libreOfficePath(): string | null {
  const candidates = [
    process.env.SKB_LIBREOFFICE_PATH,
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

/** A private profile avoids attaching to a user's running office session or changing its settings. */
export async function renderFileLayout(
  entries: EntriesService,
  requested: string,
  executable = libreOfficePath(),
): Promise<Uint8Array> {
  const file = entries.file(requested);
  const extension = path.extname(file.path).toLowerCase();
  if (!['.doc', '.docx', '.xlsx'].includes(extension))
    throw new ValidationError('Page layout is available for Word documents and Excel workbooks.');
  if (!executable)
    throw new ValidationError(
      'Page layout needs LibreOffice installed on this computer. Install LibreOffice, then try again. Reading view still works.',
    );
  if (file.sizeBytes > 16 * 1024 * 1024)
    throw new ValidationError('This document is too large for Page layout (16 MB maximum).');
  if (active)
    throw new ValidationError('Another page layout is being prepared. Please try again shortly.');
  active = true;
  let temporary: string | undefined;
  try {
    temporary = await mkdtemp(path.join(tmpdir(), 'manuscript-preview-'));
    const profile = path.join(temporary, 'profile');
    await mkdir(path.join(profile, 'user'), { recursive: true });
    await writeFile(
      path.join(profile, 'user/registrymodifications.xcu'),
      `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>1</value></prop></item>
</oor:items>`,
    );
    const input = path.join(temporary, `document${extension}`);
    await copyFile(file.absolute, input);
    await execute(
      executable,
      [
        `-env:UserInstallation=${pathToFileURL(profile).href}`,
        '--headless',
        '--nologo',
        '--nodefault',
        '--norestore',
        '--convert-to',
        'pdf',
        '--outdir',
        temporary,
        input,
      ],
      { windowsHide: true, timeout: 45_000, maxBuffer: 64 * 1024 },
    );
    const output = path.join(temporary, 'document.pdf');
    if ((await stat(output)).size > 64 * 1024 * 1024) throw new Error('Output too large');
    const bytes = await readFile(output);
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF');
    return bytes;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(
      'Page layout could not be prepared. The file may be damaged or password-protected, or conversion timed out. Reading view and the original file remain available.',
    );
  } finally {
    active = false;
    if (temporary) await rm(temporary, { recursive: true, force: true, maxRetries: 3 });
  }
}
