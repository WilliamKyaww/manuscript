import { ForbiddenError, UnauthenticatedError } from '@skb/core';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { tokensEqual } from './token';

/**
 * Request guards for the loopback server (ADR-0005, architecture.md §8):
 *  - Host allowlist on every request (DNS-rebinding defence);
 *  - cross-site fetches rejected outright for the API (Fetch Metadata);
 *  - API requests authenticated by an HttpOnly cookie or a bearer token;
 *  - cookie-authenticated state-changing requests must carry an allowed Origin (CSRF defence).
 */

export interface SecurityContext {
  readonly token: string;
  /** Port the server is actually bound to (known after listening; may differ from config when 0). */
  getPort(): number;
  /** Vite dev-server origin allowed in development only. */
  readonly devWebOrigin: string | null;
  /** API routes that do not require authentication, as `METHOD /path`. */
  readonly publicApiRoutes: ReadonlySet<string>;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** Cookie names include the port so that several local instances (dev, tests) do not collide. */
export function sessionCookieName(port: number): string {
  return `skb_session_${port}`;
}

function loopbackHosts(port: number): string[] {
  return [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
}

export function allowedHosts(security: SecurityContext): Set<string> {
  const hosts = new Set(loopbackHosts(security.getPort()));
  if (security.devWebOrigin) {
    const { port } = new URL(security.devWebOrigin);
    for (const host of loopbackHosts(Number(port))) hosts.add(host);
  }
  return hosts;
}

export function allowedOrigins(security: SecurityContext): Set<string> {
  const origins = new Set(loopbackHosts(security.getPort()).map((host) => `http://${host}`));
  if (security.devWebOrigin) {
    const { port } = new URL(security.devWebOrigin);
    for (const host of loopbackHosts(Number(port))) origins.add(`http://${host}`);
  }
  return origins;
}

export function hostGuard(security: SecurityContext): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host')?.toLowerCase();
    if (!host || !allowedHosts(security).has(host)) {
      throw new ForbiddenError(
        'Requests must be addressed to this computer (unexpected Host header).',
      );
    }
    await next();
  };
}

function bearerToken(c: Context): string | undefined {
  const header = c.req.header('authorization');
  if (!header) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1];
}

function rejectCrossSite(c: Context): void {
  if (c.req.header('sec-fetch-site') === 'cross-site') {
    throw new ForbiddenError('Cross-site requests are not allowed.');
  }
}

export function apiGuard(security: SecurityContext): MiddlewareHandler {
  return async (c, next) => {
    rejectCrossSite(c);
    if (security.publicApiRoutes.has(`${c.req.method} ${c.req.path}`)) {
      await next();
      return;
    }

    const bearer = bearerToken(c);
    if (bearer !== undefined) {
      if (!tokensEqual(security.token, bearer))
        throw new UnauthenticatedError('Invalid access token.');
      await next();
      return;
    }

    const cookie = getCookie(c, sessionCookieName(security.getPort()));
    if (!tokensEqual(security.token, cookie)) {
      throw new UnauthenticatedError(
        'Not signed in. Open the application with run-web.bat, or use the link printed by the server.',
      );
    }

    if (!SAFE_METHODS.has(c.req.method)) {
      // Cookies are ambient credentials, so state changes must prove they come from our own pages.
      const origin = c.req.header('origin');
      const fetchSite = c.req.header('sec-fetch-site');
      const originAllowed = origin !== undefined && allowedOrigins(security).has(origin);
      const sameOriginWithoutHeader = origin === undefined && fetchSite === 'same-origin';
      if (!originAllowed && !sameOriginWithoutHeader) {
        throw new ForbiddenError(
          'This request did not come from the application (origin check failed).',
        );
      }
    }
    await next();
  };
}

/** Only allow redirects to local, non-protocol-relative paths. */
export function safeRedirectPath(next: string | undefined): string {
  if (!next?.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}

/** `GET /auth?token=…&next=/path` — exchanges the bootstrap token for the session cookie. */
export function authBootstrapHandler(security: SecurityContext) {
  return (c: Context) => {
    rejectCrossSite(c);
    c.header('Cache-Control', 'no-store');
    const token = c.req.query('token');
    if (!tokensEqual(security.token, token)) {
      return c.html(
        '<!doctype html><meta charset="utf-8"><title>Study Knowledge Base</title>' +
          '<p>This sign-in link is not valid. Start the application with <code>run-web.bat</code>, ' +
          'or open the link printed in the server window.</p>',
        403,
      );
    }
    setCookie(c, sessionCookieName(security.getPort()), security.token, {
      httpOnly: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
    return c.redirect(safeRedirectPath(c.req.query('next')), 303);
  };
}
