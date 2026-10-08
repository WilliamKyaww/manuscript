/** Media types for vault files, by extension. Unknown types are served as downloads. */

const MEDIA_TYPES: Record<string, string> = {
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  json: 'application/json',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  canvas: 'application/json',
};

export function mediaTypeFor(path: string): string {
  const dot = path.lastIndexOf('.');
  const extension = dot === -1 ? '' : path.slice(dot + 1).toLowerCase();
  return MEDIA_TYPES[extension] ?? 'application/octet-stream';
}

/** Types a browser may display inline without being able to run scripts in our origin. */
const INLINE_SAFE =
  /^(image\/(png|jpeg|gif|webp|avif|bmp|x-icon)|audio\/|video\/|application\/pdf|text\/plain|text\/markdown|text\/csv)/;

export function isInlineSafe(mediaType: string): boolean {
  return INLINE_SAFE.test(mediaType);
}

export function isImage(mediaType: string): boolean {
  return mediaType.startsWith('image/');
}
