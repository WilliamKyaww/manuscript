import { APICallError } from 'ai';

/**
 * Turns a provider failure into a sentence for the student — without anything key-like. Providers
 * sometimes echo part of the key they rejected ("Incorrect API key provided: sk-…abcd"), so long
 * token-shaped strings are removed before the message is shown or logged.
 */

const KEY_LIKE = /\b(?:sk|pk|rk|key|api|or)[-_][A-Za-z0-9_*.-]{6,}|[A-Za-z0-9_*\-.]{24,}/giu;

export function scrubSecrets(text: string): string {
  return text.replace(KEY_LIKE, '[hidden]');
}

/** Codes that mean the network, or the machine the provider runs on, could not be reached. */
const UNREACHABLE = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/** The first network error code on an error or anywhere down its causes. */
function networkCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && UNREACHABLE.has(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export function describeProviderError(error: unknown): string {
  // Being offline (or the provider's server being down) is not a problem with the key or the model:
  // say so, and that everything that does not need the model still works.
  const unreachable = networkCode(error);
  if (unreachable !== null)
    return `Could not reach the provider (${unreachable}). If you are offline, or a local model is not running, AI features wait; everything else still works.`;
  if (APICallError.isInstance(error)) {
    const status = error.statusCode;
    const detail = scrubSecrets(error.message).slice(0, 300);
    if (status === 401 || status === 403)
      return `The provider refused the key (${status}): ${detail}`;
    if (status === 404) return `The provider does not know this model or address (404): ${detail}`;
    if (status === 429) return `The provider is rate-limiting or out of credit (429): ${detail}`;
    return status ? `The provider returned an error (${status}): ${detail}` : detail;
  }
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError')
      return 'The provider did not answer in time.';
    const cause = (error as { cause?: { code?: string } }).cause;
    if (cause?.code === 'ECONNREFUSED' || cause?.code === 'ENOTFOUND')
      return `Could not reach the provider (${cause.code}). Check the address and that the server is running.`;
    return scrubSecrets(error.message).slice(0, 300);
  }
  return 'The provider failed for an unknown reason.';
}
