import { NotFoundError } from '@skb/core';
import { Hono } from 'hono';
import type { AppContext } from './context';
import type { ApiRegistry } from './http/endpoint';
import { securityHeaders } from './http/headers';
import { errorHandler, problemResponse, toProblem } from './http/problem';
import { staticSite } from './http/static';
import { registerAgentRoutes } from './modules/agent/routes';
import { registerAiRoutes } from './modules/ai/routes';
import { registerCardRoutes } from './modules/cards/routes';
import { registerChatRoutes } from './modules/chat/routes';
import { registerConceptRoutes } from './modules/concepts/routes';
import { registerEventRoutes } from './modules/events/routes';
import { registerGenerationRoutes } from './modules/generation/routes';
import { registerGraphRoutes } from './modules/graph/routes';
import type { AppModules } from './modules/index';
import { registerLearningRoutes } from './modules/learning/routes';
import { registerNotesRoutes } from './modules/notes/routes';
import { registerPlanRoutes } from './modules/plan/routes';
import { registerPracticeRoutes } from './modules/practice/routes';
import { registerSearchRoutes } from './modules/search/routes';
import { registerSettingsRoutes } from './modules/settings/routes';
import { registerSourcesRoutes } from './modules/sources/routes';
import { registerSystemRoutes } from './modules/system/routes';
import { apiGuard, authBootstrapHandler, hostGuard, type SecurityContext } from './security/guards';

export interface AuthOptions {
  token: string;
  /** The bound port; read lazily because it is only known after listening. */
  getPort(): number;
}

export interface CreatedApp {
  app: Hono;
  security: SecurityContext;
}

/** Composes middleware and module routes. Order matters: see comments. */
export function createApp(ctx: AppContext, modules: AppModules, auth: AuthOptions): CreatedApp {
  const app = new Hono();
  const publicApiRoutes = new Set<string>();
  const security: SecurityContext = {
    token: auth.token,
    getPort: auth.getPort,
    devWebOrigin: ctx.config.devWebOrigin,
    publicApiRoutes,
  };

  app.onError(errorHandler(ctx.logger));
  // 1. Headers wrap everything, including error responses.
  app.use('*', securityHeaders());
  // 2. Host allowlist before anything else is processed (DNS rebinding).
  app.use('*', hostGuard(security));
  // 3. Bootstrap sign-in is reachable without a session.
  app.get('/auth', authBootstrapHandler(security));
  // 4. Every API route is authenticated unless registered as public.
  app.use('/api/*', apiGuard(security));

  const registry: ApiRegistry = {
    app,
    publicApiRoutes,
    validateResponses: ctx.config.mode !== 'production',
  };
  registerSystemRoutes(registry, ctx);
  registerSettingsRoutes(registry, modules.settings);
  registerNotesRoutes(registry, modules.notes);
  registerSearchRoutes(registry, modules.search);
  registerSourcesRoutes(registry, modules.sources.service);
  registerLearningRoutes(registry, modules.learning, modules.lectures);
  registerConceptRoutes(registry, modules.concepts);
  registerGraphRoutes(registry, modules.graph, modules.relations, modules.mastery);
  registerCardRoutes(registry, modules.cards, modules.reviews, modules.settings);
  registerPracticeRoutes(registry, modules);
  registerAiRoutes(registry, { ...modules, logger: ctx.logger });
  registerGenerationRoutes(registry, modules);
  registerAgentRoutes(registry, modules.agent);
  registerChatRoutes(registry, modules.chat, ctx.logger);
  registerPlanRoutes(registry, modules.plan, modules.settings);
  registerEventRoutes(registry, ctx);

  // Unknown API routes are problem-details 404s, never the SPA.
  app.all('/api/*', () => {
    throw new NotFoundError('No such API endpoint.');
  });

  if (ctx.config.webDir) app.use('*', staticSite(ctx.config.webDir));

  app.notFound((c) => problemResponse(toProblem(new NotFoundError('Not found.'), c.req.path)));
  return { app, security };
}
