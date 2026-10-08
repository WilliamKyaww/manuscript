import {
  deleteSourceEndpoint,
  getSourceEndpoint,
  ImportResultSchema,
  importSourcePathEndpoint,
  listSourcesEndpoint,
  MAX_SOURCE_BYTES,
  ModuleCodeSchema,
  retrySourceEndpoint,
  SOURCE_UPLOAD_PATH,
  sourceSectionsEndpoint,
  ValidationError,
} from '@skb/core';
import { bodyLimit } from 'hono/body-limit';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { SourcesService } from './service';

const tooLarge = () =>
  new ValidationError(`Files can be at most ${MAX_SOURCE_BYTES / 1024 / 1024} MB.`);

export function registerSourcesRoutes(registry: ApiRegistry, sources: SourcesService): void {
  registerEndpoint(registry, listSourcesEndpoint, () => ({ sources: sources.list() }));
  registerEndpoint(registry, getSourceEndpoint, ({ params }) => sources.get(params.id));
  registerEndpoint(registry, sourceSectionsEndpoint, ({ params }) => ({
    sections: sources.sections(params.id),
  }));
  registerEndpoint(registry, importSourcePathEndpoint, ({ body }) =>
    sources.importPath(body.path, body.module ?? null),
  );
  registerEndpoint(registry, retrySourceEndpoint, ({ params }) => sources.retry(params.id));
  registerEndpoint(registry, deleteSourceEndpoint, ({ params }) => ({
    ok: true as const,
    trashId: sources.remove(params.id).trashId,
  }));

  // Multipart upload: `file`, optional `module`.
  registry.app.post(
    SOURCE_UPLOAD_PATH,
    bodyLimit({
      maxSize: MAX_SOURCE_BYTES + 64 * 1024,
      onError: () => {
        throw tooLarge();
      },
    }),
    async (c) => {
      let form: Record<string, string | File | (string | File)[]>;
      try {
        form = await c.req.parseBody();
      } catch {
        throw new ValidationError('Send the file as multipart/form-data with a "file" field.');
      }
      const file = form.file;
      if (!(file instanceof File)) throw new ValidationError('Send the file in a "file" field.');
      if (file.size > MAX_SOURCE_BYTES) throw tooLarge();
      let moduleCode: string | null = null;
      if (typeof form.module === 'string' && form.module.trim() !== '') {
        const parsed = ModuleCodeSchema.safeParse(form.module);
        if (!parsed.success) {
          throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid module code.');
        }
        moduleCode = parsed.data;
      }
      const result = sources.importFile({
        fileName: file.name || 'upload',
        bytes: new Uint8Array(await file.arrayBuffer()),
        moduleCode,
      });
      return c.json(ImportResultSchema.parse(result), result.duplicate ? 200 : 201);
    },
  );
}
