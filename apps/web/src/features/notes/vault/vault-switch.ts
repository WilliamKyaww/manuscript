import { useEffect, useState } from 'react';
import { notifyError } from '../../../lib/notify';
import { useDataActions } from '../../data/api';

/**
 * Switching vault (Phase 16, task 23.03): the server opens the other folder by restarting, and the
 * page reloads once it answers again. Where nothing can restart it (`npm run dev`), the choice is
 * kept for the next start and the student is told so.
 */
export function useVaultSwitch() {
  const actions = useDataActions();
  const [message, setMessage] = useState<string | null>(null);
  const restarting = message?.startsWith('Opening') ?? false;

  const switchTo = (path: string) =>
    actions.switchVault.mutate(path, {
      onSuccess: (result) =>
        setMessage(
          result.restarting
            ? 'Opening that vault… this page reloads when Manuscript is back.'
            : 'That vault will open the next time you start Manuscript. Close it and start it again to switch now.',
        ),
      onError: notifyError,
    });

  // After a restart the old page has nothing to talk to; reload once the server answers again.
  useEffect(() => {
    if (!restarting) return;
    const timer = window.setInterval(() => {
      fetch('/api/ping')
        .then((response) => {
          if (response.ok) window.location.reload();
        })
        .catch(() => undefined);
    }, 2_000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 120_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [restarting]);

  return {
    switchTo,
    message,
    pending: actions.switchVault.isPending,
    inspect: actions.inspect,
    forget: actions.forgetVault,
  };
}
