import { z } from 'zod';
import { APP_ID } from '../app';
import { defineEndpoint } from './contract';

export const RunModeSchema = z.enum(['development', 'production', 'test']);
export type RunMode = z.infer<typeof RunModeSchema>;

/** Unauthenticated readiness probe. Deliberately reveals nothing but the application identity. */
export const PingResponseSchema = z.object({
  app: z.literal(APP_ID),
  ok: z.literal(true),
});
export type PingResponse = z.infer<typeof PingResponseSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  mode: RunModeSchema,
  startedAt: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  vault: z.object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
  }),
  database: z.object({
    ok: z.boolean(),
    sqliteVersion: z.string(),
    appliedMigrations: z.number().int().nonnegative(),
    latestMigration: z.string().nullable(),
  }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const pingEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/ping',
  auth: 'none',
  response: PingResponseSchema,
});

export const healthEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/health',
  response: HealthResponseSchema,
});
