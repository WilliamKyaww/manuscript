import { toast } from 'sonner';
import { ApiError } from './api/client';

/** Human-readable description of any error, preferring the server's problem details. */
export function describeError(error: unknown): { title: string; description: string } {
  if (error instanceof ApiError) {
    if (error.code === 'unreachable') {
      return {
        title: 'Cannot reach the local server',
        description: 'Check that Manuscript is still running.',
      };
    }
    if (error.isUnauthenticated) {
      return {
        title: 'Signed out',
        description: 'Open the sign-in link from the server window to continue.',
      };
    }
    return { title: error.problem?.title ?? 'Request failed', description: error.message };
  }
  if (error instanceof Error) return { title: 'Something went wrong', description: error.message };
  return { title: 'Something went wrong', description: String(error) };
}

/** Shows an error toast (used for failed mutations and background actions). */
export function notifyError(error: unknown): void {
  const { title, description } = describeError(error);
  toast.error(title, { description });
}

export function notifySuccess(message: string, description?: string): void {
  toast.success(message, description ? { description } : undefined);
}
