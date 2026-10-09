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

export function describeProviderError(error: unknown): string {
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
