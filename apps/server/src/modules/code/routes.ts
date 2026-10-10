import {
  CODE_GRAPH_UPLOAD_PATH,
  CodeImportResultSchema,
  conceptCodeEndpoint,
  decideCodeLinkEndpoint,
  deleteCodeGraphEndpoint,
  getCodeEntityEndpoint,
  linkCodeEndpoint,
  listCodeGraphsEndpoint,
  MAX_CODE_GRAPH_BYTES,
  ModuleCodeSchema,
  rematchCodeGraphEndpoint,
  removeCodeLinkEndpoint,
  searchCodeEntitiesEndpoint,
  updateCodeGraphEndpoint,
  ValidationError,
} from '@skb/core';
import { bodyLimit } from 'hono/body-limit';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { CodeService } from './service';

const tooLarge = () =>
  new ValidationError(`The graph can be at most ${MAX_CODE_GRAPH_BYTES / 1024 / 1024} MB.`);

export function registerCodeRoutes(registry: ApiRegistry, code: CodeService): void {
  registerEndpoint(registry, listCodeGraphsEndpoint, () => ({ graphs: code.list() }));
  registerEndpoint(registry, updateCodeGraphEndpoint, ({ params, body }) =>
    code.update(params.id, body),
  );
  registerEndpoint(registry, deleteCodeGraphEndpoint, ({ params }) => {
    code.remove(params.id);
    return { ok: true as const };
  });
  registerEndpoint(registry, rematchCodeGraphEndpoint, ({ params }) => code.rematch(params.id));
  registerEndpoint(registry, searchCodeEntitiesEndpoint, ({ query }) => code.search(query));
  registerEndpoint(registry, getCodeEntityEndpoint, ({ params }) => code.entity(params.id));
  registerEndpoint(registry, conceptCodeEndpoint, ({ params }) => code.linksOfConcept(params.id));
  registerEndpoint(registry, linkCodeEndpoint, ({ params, body }) =>
    code.link(params.id, body.entityId),
  );
  registerEndpoint(registry, decideCodeLinkEndpoint, ({ params, body }) =>
    code.decide(params.id, params.entityId, body.status),
  );
  registerEndpoint(registry, removeCodeLinkEndpoint, ({ params }) => {
    code.unlink(params.id, params.entityId);
    return { ok: true as const };
  });

  // Multipart upload: `file`, optional `name` and `module`.
  registry.app.post(
    CODE_GRAPH_UPLOAD_PATH,
    bodyLimit({
      maxSize: MAX_CODE_GRAPH_BYTES + 64 * 1024,
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
      if (file.size > MAX_CODE_GRAPH_BYTES) throw tooLarge();
      let moduleCode: string | null = null;
      if (typeof form.module === 'string' && form.module.trim() !== '') {
        const parsed = ModuleCodeSchema.safeParse(form.module);
        if (!parsed.success)
          throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid module code.');
        moduleCode = parsed.data;
      }
      const result = code.importGraph({
        fileName: file.name || 'graph.json',
        bytes: new Uint8Array(await file.arrayBuffer()),
        name: typeof form.name === 'string' ? form.name : null,
        moduleCode,
      });
      return c.json(CodeImportResultSchema.parse(result), result.duplicate ? 200 : 201);
    },
  );
}
