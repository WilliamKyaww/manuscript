import { z } from 'zod';
import { idSchema } from '../ids';
import { ConceptIdSchema } from './concepts';
import { defineEndpoint } from './contract';
import { ModuleIdSchema, ModuleRefSchema } from './course';

/**
 * Code graphs (Phase 16, task 16.06): a Graphify `graph.json` of a coursework or dissertation
 * repository, imported so that the code can be linked to the concepts it implements. The entities
 * become nodes of the knowledge graph (type `code`); name matches are proposed, never assumed.
 */

export const CodeGraphIdSchema = idSchema('codeGraph');
export const CodeEntityIdSchema = idSchema('codeEntity');

export const CodeGraphSchema = z.object({
  id: CodeGraphIdSchema,
  name: z.string(),
  fileName: z.string(),
  module: ModuleRefSchema.nullable(),
  entities: z.number().int().nonnegative(),
  edges: z.number().int().nonnegative(),
  links: z.object({
    proposed: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
  }),
  importedAt: z.string(),
});
export type CodeGraph = z.infer<typeof CodeGraphSchema>;

export const CodeEntitySchema = z.object({
  id: CodeEntityIdSchema,
  graphId: CodeGraphIdSchema,
  graphName: z.string(),
  label: z.string(),
  /** Graphify's `file_type`: `code`, `document`, `rationale` … */
  kind: z.string(),
  file: z.string().nullable(),
  location: z.string().nullable(),
  rationale: z.string().nullable(),
});
export type CodeEntity = z.infer<typeof CodeEntitySchema>;

export const CodeLinkStatusSchema = z.enum(['proposed', 'accepted', 'rejected']);
export type CodeLinkStatus = z.infer<typeof CodeLinkStatusSchema>;

export const CodeLinkSchema = z.object({
  entity: CodeEntitySchema,
  status: CodeLinkStatusSchema,
  score: z.number().nullable(),
  /** Why it is suggested, or that the student chose it. */
  reason: z.string(),
  createdBy: z.enum(['user', 'system']),
});
export type CodeLink = z.infer<typeof CodeLinkSchema>;

export const CodeImportResultSchema = z.object({
  graph: CodeGraphSchema,
  /** The same file was imported before; nothing was added. */
  duplicate: z.boolean(),
  /** Edges that pointed at nodes the file does not have. */
  droppedEdges: z.number().int().nonnegative(),
});
export type CodeImportResult = z.infer<typeof CodeImportResultSchema>;

/** `POST` multipart/form-data: `file`, optional `name` and `module` (a module code). */
export const CODE_GRAPH_UPLOAD_PATH = '/api/code/graphs';
export const MAX_CODE_GRAPH_BYTES = 60 * 1024 * 1024;

export const listCodeGraphsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/code/graphs',
  response: z.object({ graphs: z.array(CodeGraphSchema) }),
});

export const deleteCodeGraphEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/code/graphs/:id',
  params: z.object({ id: CodeGraphIdSchema }),
  response: z.object({ ok: z.literal(true) }),
});

export const updateCodeGraphEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/code/graphs/:id',
  params: z.object({ id: CodeGraphIdSchema }),
  body: z.object({
    name: z.string().trim().min(1).max(120).optional(),
    moduleId: ModuleIdSchema.nullable().optional(),
  }),
  response: CodeGraphSchema,
});

/** Looks for name matches again (after concepts were added); decisions already made are kept. */
export const rematchCodeGraphEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/code/graphs/:id/rematch',
  params: z.object({ id: CodeGraphIdSchema }),
  response: z.object({ proposed: z.number().int().nonnegative() }),
});

export const searchCodeEntitiesEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/code/entities',
  query: z.object({
    q: z.string().trim().max(200).optional(),
    graph: CodeGraphIdSchema.optional(),
    kind: z.string().trim().max(40).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  }),
  response: z.object({ entities: z.array(CodeEntitySchema), total: z.number().int() }),
});

export const getCodeEntityEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/code/entities/:id',
  params: z.object({ id: CodeEntityIdSchema }),
  response: z.object({
    entity: CodeEntitySchema,
    /** What it uses and what uses it, as Graphify recorded it. */
    edges: z.array(
      z.object({
        direction: z.enum(['out', 'in']),
        relation: z.string(),
        confidence: z.enum(['EXTRACTED', 'INFERRED', 'AMBIGUOUS']),
        other: z.object({ id: CodeEntityIdSchema, label: z.string(), kind: z.string() }),
      }),
    ),
    concepts: z.array(
      z.object({
        id: ConceptIdSchema,
        name: z.string(),
        status: CodeLinkStatusSchema,
        reason: z.string(),
      }),
    ),
  }),
});

const ConceptParams = z.object({ id: ConceptIdSchema });

export const conceptCodeEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/concepts/:id/code',
  params: ConceptParams,
  response: z.object({ links: z.array(CodeLinkSchema) }),
});

/** Links a concept to a code entity by hand (accepted at once). */
export const linkCodeEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/concepts/:id/code',
  status: 201,
  params: ConceptParams,
  body: z.object({ entityId: CodeEntityIdSchema }),
  response: CodeLinkSchema,
});

/** Accepts or rejects a suggested link; rejecting keeps it from being suggested again. */
export const decideCodeLinkEndpoint = defineEndpoint({
  method: 'PUT',
  path: '/api/concepts/:id/code/:entityId',
  params: z.object({ id: ConceptIdSchema, entityId: CodeEntityIdSchema }),
  body: z.object({ status: z.enum(['accepted', 'rejected']) }),
  response: CodeLinkSchema,
});

export const removeCodeLinkEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/concepts/:id/code/:entityId',
  params: z.object({ id: ConceptIdSchema, entityId: CodeEntityIdSchema }),
  response: z.object({ ok: z.literal(true) }),
});
