import { z } from 'zod';
import { defineEndpoint } from './contract';
import { VaultPathSchema } from './notes';

export const FilePreviewSchema = z.object({
  path: z.string(),
  kind: z.enum(['pdf', 'image', 'text', 'code', 'document', 'table', 'unsupported']),
  text: z.string().default(''),
  sourceText: z.string().default(''),
  language: z.string().default(''),
  sheets: z.array(z.object({ name: z.string(), rows: z.array(z.array(z.string())) })).default([]),
  notice: z.string().nullable().default(null),
});
export type FilePreview = z.infer<typeof FilePreviewSchema>;
export const filePreviewEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/file-preview',
  query: z.object({ path: VaultPathSchema }),
  response: FilePreviewSchema,
});
