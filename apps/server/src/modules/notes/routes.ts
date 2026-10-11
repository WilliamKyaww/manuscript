import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import {
  ATTACHMENT_UPLOAD_PATH,
  backlinksEndpoint,
  copyEntryEndpoint,
  createFolderEndpoint,
  createNoteEndpoint,
  FILES_PATH_PREFIX,
  getBookmarksEndpoint,
  getNoteEndpoint,
  getVersionEndpoint,
  keepVersionEndpoint,
  linkMentionEndpoint,
  listNotesEndpoint,
  listTagsEndpoint,
  listTemplatesEndpoint,
  listTrashEndpoint,
  listVersionsEndpoint,
  MAX_ATTACHMENT_BYTES,
  mergeNoteEndpoint,
  moveEntryEndpoint,
  movePreviewEndpoint,
  purgeTrashEndpoint,
  putBookmarksEndpoint,
  restoreTrashEndpoint,
  trashEntryEndpoint,
  UploadedAttachmentSchema,
  unlinkedMentionsEndpoint,
  updateNoteEndpoint,
  ValidationError,
} from '@skb/core';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { EntriesService, VaultFile } from './entries';
import { isInlineSafe } from './media-types';
import type { NotesModule } from './module';
import { VERSION_RETENTION_DAYS } from './versions';

export function registerNotesRoutes(registry: ApiRegistry, module: NotesModule): void {
  const { notes, entries, versions, bookmarks } = module;
  registerEndpoint(registry, listNotesEndpoint, () => notes.tree());
  registerEndpoint(registry, getNoteEndpoint, ({ params }) => notes.get(params.id));
  registerEndpoint(registry, createNoteEndpoint, ({ body }) => notes.create(body));
  registerEndpoint(registry, updateNoteEndpoint, ({ params, body }) =>
    notes.update(params.id, body),
  );
  registerEndpoint(registry, backlinksEndpoint, ({ params }) => notes.backlinks(params.id));
  registerEndpoint(registry, unlinkedMentionsEndpoint, ({ params }) =>
    notes.unlinkedMentions(params.id),
  );
  registerEndpoint(registry, linkMentionEndpoint, ({ params, body }) =>
    notes.linkMention(params.id, body),
  );
  registerEndpoint(registry, mergeNoteEndpoint, ({ params, body }) =>
    module.merge(params.id, body.targetId),
  );
  registerEndpoint(registry, listVersionsEndpoint, ({ params }) => {
    notes.get(params.id);
    return { versions: versions.list(params.id), retentionDays: VERSION_RETENTION_DAYS };
  });
  registerEndpoint(registry, getVersionEndpoint, ({ params }) =>
    versions.read(params.id, params.versionId),
  );
  registerEndpoint(registry, keepVersionEndpoint, ({ params }) => {
    const current = notes.get(params.id);
    return { version: versions.keep(params.id, current.content, 'restore') };
  });
  registerEndpoint(registry, getBookmarksEndpoint, () => bookmarks.list());
  registerEndpoint(registry, putBookmarksEndpoint, ({ body }) => bookmarks.replace(body));
  registerEndpoint(registry, listTagsEndpoint, () => ({ tags: notes.tags() }));
  registerEndpoint(registry, listTemplatesEndpoint, () => notes.templates());

  registerEndpoint(registry, createFolderEndpoint, ({ body }) => entries.createFolder(body.path));
  registerEndpoint(registry, movePreviewEndpoint, ({ body }) =>
    entries.movePreview(body.from, body.to),
  );
  registerEndpoint(registry, moveEntryEndpoint, ({ body }) =>
    entries.move(body.from, body.to, body.rewriteLinks),
  );
  registerEndpoint(registry, copyEntryEndpoint, ({ body }) => entries.copy(body.path));
  registerEndpoint(registry, trashEntryEndpoint, ({ body }) => entries.trash(body.path));
  registerEndpoint(registry, listTrashEndpoint, () => entries.listTrash());
  registerEndpoint(registry, restoreTrashEndpoint, ({ params }) => entries.restore(params.id));
  registerEndpoint(registry, purgeTrashEndpoint, ({ params }) => {
    entries.purge(params.id);
    return { ok: true as const };
  });

  registry.app.post(
    ATTACHMENT_UPLOAD_PATH,
    bodyLimit({
      maxSize: MAX_ATTACHMENT_BYTES + 64 * 1024,
      onError: () => {
        throw new ValidationError(
          `Attachments can be at most ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`,
        );
      },
    }),
    async (c) => {
      let form: Record<string, string | File | (string | File)[]>;
      try {
        form = await c.req.parseBody();
      } catch {
        throw new ValidationError(
          'Send the attachment as multipart/form-data with a "file" field.',
        );
      }
      const file = form.file;
      if (!(file instanceof File))
        throw new ValidationError('Send the attachment in a "file" field.');
      if (file.size > MAX_ATTACHMENT_BYTES) {
        throw new ValidationError(
          `Attachments can be at most ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.`,
        );
      }
      const folder = typeof form.folder === 'string' ? form.folder : null;
      const saved = entries.saveAttachment({
        fileName: file.name || 'attachment',
        bytes: new Uint8Array(await file.arrayBuffer()),
        folder,
      });
      return c.json(UploadedAttachmentSchema.parse(saved), 201);
    },
  );

  registry.app.on(['GET', 'HEAD'], `${FILES_PATH_PREFIX}*`, (c) => serveFile(c, entries));
}

/** Vault path from `/api/files/<encoded segments>`. */
function requestedPath(c: Context): string {
  const encoded = new URL(c.req.url).pathname.slice(FILES_PATH_PREFIX.length);
  try {
    return encoded
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
  } catch {
    throw new ValidationError('The file path is not valid.');
  }
}

function fileHeaders(file: VaultFile): Record<string, string> {
  const name = encodeURIComponent(file.path.slice(file.path.lastIndexOf('/') + 1));
  const isPdf = file.mediaType === 'application/pdf';
  return {
    'Content-Type': file.mediaType,
    'Accept-Ranges': 'bytes',
    ETag: `W/"${file.sizeBytes.toString(16)}-${Math.trunc(file.mtimeMs).toString(16)}"`,
    'Cache-Control': 'private, no-cache',
    'Content-Disposition': `${isInlineSafe(file.mediaType) || file.mediaType === 'image/svg+xml' ? 'inline' : 'attachment'}; filename*=UTF-8''${name}`,
    // Files are user content: they may be framed by the app (PDF embeds) but never run scripts in
    // our origin. Chromium's PDF viewer does not load under a sandbox policy, so PDFs omit it.
    'Content-Security-Policy': isPdf
      ? "default-src 'none'; frame-ancestors 'self'"
      : "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; sandbox",
    'X-Frame-Options': 'SAMEORIGIN',
  };
}

function serveFile(c: Context, entries: EntriesService): Response {
  const file = entries.file(requestedPath(c));
  const headers = fileHeaders(file);
  if (c.req.header('if-none-match') === headers.ETag)
    return new Response(null, { status: 304, headers });

  let start = 0;
  let end = file.sizeBytes - 1;
  let status = 200;
  const range = c.req.header('range');
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (match && file.sizeBytes > 0) {
    const [, first = '', last = ''] = match;
    if (first === '' && last !== '') {
      start = Math.max(0, file.sizeBytes - Number(last));
    } else {
      start = Number(first);
      if (last !== '') end = Math.min(end, Number(last));
    }
    if (start > end || start >= file.sizeBytes) {
      return new Response(null, {
        status: 416,
        headers: { ...headers, 'Content-Range': `bytes */${file.sizeBytes}` },
      });
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${file.sizeBytes}`;
  }
  const length = file.sizeBytes === 0 ? 0 : end - start + 1;
  headers['Content-Length'] = String(length);
  if (c.req.method === 'HEAD' || length === 0) return new Response(null, { status, headers });
  const stream = Readable.toWeb(
    createReadStream(file.absolute, { start, end }),
  ) as ReadableStream<Uint8Array>;
  return new Response(stream, { status, headers });
}
