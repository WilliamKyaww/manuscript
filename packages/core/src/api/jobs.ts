import { z } from 'zod';

/** Background jobs (ADR-0008): ingestion now; embeddings and generation in later phases. */

export const JobStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobSummarySchema = z.object({
  id: z.string(),
  kind: z.string(),
  /** The entity the job works on (e.g. a source id), if any. */
  subject: z.string().nullable(),
  status: JobStatusSchema,
  /** 0–1. */
  progress: z.number().min(0).max(1),
  message: z.string().nullable(),
  error: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobSummary = z.infer<typeof JobSummarySchema>;
