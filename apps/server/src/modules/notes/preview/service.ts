import { open } from 'node:fs/promises';
import { type FilePreview, FilePreviewSchema, ValidationError } from '@skb/core';
import { docxParser } from '../../sources/parsers/docx';
import { SourceParseError } from '../../sources/parsers/errors';
import type { EntriesService } from '../entries';
import { formatJson } from './json';
import { legacyWord } from './legacy-word';
import { CSV_NOTICE, csvRows, WORKBOOK_NOTICE, workbookSheets } from './tables';

const LANGUAGES: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  html: 'html',
  css: 'css',
  json: 'json',
  xml: 'xml',
};
const TEXT_LIMIT = 500_000;

export async function previewFile(entries: EntriesService, path: string): Promise<FilePreview> {
  const file = entries.file(path);
  const extension = path.split('.').at(-1)?.toLowerCase() ?? '';
  const result = FilePreviewSchema.parse({ path: file.path, kind: 'unsupported' });
  if (extension === 'pdf') return { ...result, kind: 'pdf' };
  if (['jpeg', 'jpg', 'png', 'gif', 'svg', 'webp', 'avif', 'bmp'].includes(extension))
    return { ...result, kind: 'image' };
  const office = ['doc', 'docx', 'xlsx'].includes(extension);
  if (!office && extension !== 'txt' && extension !== 'csv' && !LANGUAGES[extension]) return result;
  const limitMb = office ? 16 : 2;
  if (file.sizeBytes > limitMb * 1024 * 1024)
    throw new ValidationError(
      `This file is too large to preview (${limitMb} MB is the most for this type). Download it or open the original instead.`,
    );
  const handle = await open(file.absolute, 'r');
  let bytes: Buffer;
  try {
    // A bounded read remains bounded if another program grows the file after the initial stat.
    bytes = Buffer.alloc(Math.min(file.sizeBytes + 1, 16 * 1024 * 1024 + 1));
    const read = await handle.read(bytes, 0, bytes.length, 0);
    bytes = bytes.subarray(0, read.bytesRead);
  } finally {
    await handle.close();
  }
  try {
    if (extension === 'xlsx')
      return { ...result, kind: 'table', sheets: workbookSheets(bytes), notice: WORKBOOK_NOTICE };
    if (extension === 'docx') {
      const document = await docxParser.parse({
        bytes,
        sourceId: 'preview',
        fileName: path,
        signal: AbortSignal.timeout(5000),
      });
      return {
        ...result,
        kind: 'document',
        text: document.sections
          .map((section) => section.text)
          .join('\n\n')
          .slice(0, TEXT_LIMIT),
        notice:
          'Reading view preserves headings, lists and tables. Images and exact pagination are available in Page layout.',
      };
    }
    if (extension === 'doc')
      return {
        ...result,
        kind: 'text',
        text: await legacyWord(bytes),
        notice:
          'Reading view extracts the document text. Use Page layout for formatting and pagination.',
      };
    const encoding =
      bytes[0] === 0xff && bytes[1] === 0xfe
        ? 'utf-16le'
        : bytes[0] === 0xfe && bytes[1] === 0xff
          ? 'utf-16be'
          : 'utf-8';
    const full = new TextDecoder(encoding, { fatal: true }).decode(bytes);
    if (full.includes('\0')) throw new Error('Binary content');
    const cutShort =
      'Preview limited to the first 500,000 characters. The original file is unchanged.';
    let notice: string | null = full.length > TEXT_LIMIT ? cutShort : null;
    const sourceText = full.slice(0, TEXT_LIMIT);
    let text = sourceText;
    if (extension === 'csv')
      return {
        ...result,
        kind: 'table',
        text,
        sourceText,
        sheets: [{ name: 'Data', rows: csvRows(text) }],
        notice: notice ? `${CSV_NOTICE} ${notice}` : CSV_NOTICE,
      };
    if (extension === 'json') {
      try {
        // Formatted from the whole file: a file cut at 500,000 characters would no longer be JSON.
        const formatted = formatJson(full, TEXT_LIMIT);
        text = formatted.slice(0, TEXT_LIMIT);
        notice = formatted.length > TEXT_LIMIT ? cutShort : null;
      } catch {
        notice = 'This is not valid JSON. Its original text is shown.';
      }
    }
    return {
      ...result,
      kind: LANGUAGES[extension] ? 'code' : 'text',
      language: LANGUAGES[extension] ?? '',
      text,
      sourceText,
      notice,
    };
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    // The parsers word their reasons for the student (too large, damaged, protected).
    if (error instanceof SourceParseError)
      throw new ValidationError(`${error.message} Open the original instead.`);
    throw new ValidationError(
      'This file could not be previewed. It may be damaged, encrypted or use an unsupported encoding. Open the original instead.',
    );
  }
}
