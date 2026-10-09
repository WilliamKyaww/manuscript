import type { SourceKind } from './types';

/**
 * Source type detection (task 5.05): the extension says what the file claims to be and the first
 * bytes must agree, so a renamed executable or a ZIP called `.pdf` is refused before any parser sees
 * it. Pure, so the browser can use the extension rules for its file picker too.
 */

export const SOURCE_EXTENSIONS: Readonly<Record<string, SourceKind>> = {
  pdf: 'pdf',
  pptx: 'pptx',
  docx: 'docx',
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  text: 'text',
  // Phase 11: recordings are transcribed and images read by the AI layer.
  mp3: 'audio',
  m4a: 'audio',
  wav: 'audio',
  ogg: 'audio',
  oga: 'audio',
  flac: 'audio',
  aac: 'audio',
  mp4: 'video',
  m4v: 'video',
  mov: 'video',
  webm: 'video',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
};

/** Media types by extension, for kinds with several formats (audio, video, images). */
export const EXTENSION_MEDIA_TYPES: Readonly<Record<string, string>> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export const SOURCE_MEDIA_TYPES: Readonly<Partial<Record<SourceKind, string>>> = {
  pdf: 'application/pdf',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  markdown: 'text/markdown; charset=utf-8',
  text: 'text/plain; charset=utf-8',
};

/** For file pickers: `.pdf,.pptx,…`. */
export const SOURCE_ACCEPT = Object.keys(SOURCE_EXTENSIONS)
  .map((extension) => `.${extension}`)
  .join(',');

/** Bytes callers should pass to `detectSourceKind`. */
export const DETECT_HEAD_BYTES = 4096;

export type DetectResult =
  | { ok: true; kind: SourceKind; mediaType: string }
  | { ok: false; reason: string };

const SUPPORTED =
  'PDF, PowerPoint (.pptx), Word (.docx), Markdown, plain text, recordings (MP3, M4A, WAV, MP4, WebM…) and images (PNG, JPEG, GIF, WebP)';

const LEGACY: Readonly<Record<string, string>> = {
  ppt: 'Old PowerPoint files (.ppt) cannot be read. Save the file as .pptx and import that.',
  doc: 'Old Word files (.doc) cannot be read. Save the file as .docx and import that.',
  pptm: 'Macro-enabled presentations (.pptm) are not imported. Save a copy as .pptx.',
  docm: 'Macro-enabled documents (.docm) are not imported. Save a copy as .docx.',
};

export function extensionOf(fileName: string): string {
  const name = fileName.slice(Math.max(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04
const ascii = (text: string) => [...text].map((character) => character.charCodeAt(0));

/** The signatures of the media formats, by extension: bytes expected at an offset. */
const MEDIA_SIGNATURES: Readonly<Record<string, readonly (readonly [number[], number])[]>> = {
  // ID3 tags, or an MPEG audio frame header.
  mp3: [
    [ascii('ID3'), 0],
    [[0xff, 0xfb], 0],
    [[0xff, 0xf3], 0],
    [[0xff, 0xf2], 0],
  ],
  wav: [[ascii('WAVE'), 8]],
  ogg: [[ascii('OggS'), 0]],
  oga: [[ascii('OggS'), 0]],
  flac: [[ascii('fLaC'), 0]],
  aac: [
    [[0xff, 0xf1], 0],
    [[0xff, 0xf9], 0],
    [ascii('ID3'), 0],
  ],
  // ISO media (MP4, M4A, QuickTime): a "ftyp" box first.
  m4a: [[ascii('ftyp'), 4]],
  mp4: [[ascii('ftyp'), 4]],
  m4v: [[ascii('ftyp'), 4]],
  mov: [
    [ascii('ftyp'), 4],
    [ascii('moov'), 4],
    [ascii('wide'), 4],
    [ascii('mdat'), 4],
  ],
  webm: [[[0x1a, 0x45, 0xdf, 0xa3], 0]],
  png: [[[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0]],
  jpg: [[[0xff, 0xd8, 0xff], 0]],
  jpeg: [[[0xff, 0xd8, 0xff], 0]],
  gif: [[ascii('GIF8'), 0]],
  webp: [[ascii('WEBP'), 8]],
};

/** PDF readers accept the header anywhere in the first kilobyte. */
function isPdf(head: Uint8Array): boolean {
  const limit = Math.min(head.length - PDF_SIGNATURE.length, 1024);
  for (let offset = 0; offset <= limit; offset += 1) {
    if (startsWith(head, PDF_SIGNATURE, offset)) return true;
  }
  return false;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

/** Text is valid UTF-8 without NUL bytes (a multi-byte character may be cut at the end of the head). */
function isUtf8Text(head: Uint8Array, complete: boolean): boolean {
  if (head.includes(0)) return false;
  for (let cut = 0; cut <= (complete ? 0 : 3); cut += 1) {
    try {
      utf8.decode(head.subarray(0, head.length - cut));
      return true;
    } catch {
      // Try again without a possibly truncated final character.
    }
  }
  return false;
}

/**
 * @param head the first `DETECT_HEAD_BYTES` bytes of the file (or all of it, if shorter)
 * @param complete true when `head` is the whole file
 */
export function detectSourceKind(
  fileName: string,
  head: Uint8Array,
  complete = false,
): DetectResult {
  const extension = extensionOf(fileName);
  const legacy = LEGACY[extension];
  if (legacy) return { ok: false, reason: legacy };
  const kind = SOURCE_EXTENSIONS[extension];
  if (!kind) {
    return {
      ok: false,
      reason: extension
        ? `.${extension} files cannot be imported. Supported formats: ${SUPPORTED}.`
        : `The file has no extension, so its format is unknown. Supported formats: ${SUPPORTED}.`,
    };
  }
  if (head.length === 0) return { ok: false, reason: 'The file is empty.' };

  const media = MEDIA_SIGNATURES[extension];
  const matches = media
    ? media.some(([signature, offset]) => startsWith(head, signature, offset))
    : kind === 'pdf'
      ? isPdf(head)
      : kind === 'pptx' || kind === 'docx'
        ? startsWith(head, ZIP_SIGNATURE)
        : isUtf8Text(head, complete);
  if (!matches) {
    const reason =
      kind === 'markdown' || kind === 'text'
        ? `The file is not UTF-8 text, although it is called .${extension}. Save it as UTF-8 and try again.`
        : `The file's contents do not match its .${extension} extension, so it was not imported.`;
    return { ok: false, reason };
  }
  return {
    ok: true,
    kind,
    mediaType:
      EXTENSION_MEDIA_TYPES[extension] ?? SOURCE_MEDIA_TYPES[kind] ?? 'application/octet-stream',
  };
}
