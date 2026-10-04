import { Toaster as SonnerToaster } from 'sonner';
import { useThemeStore } from './theme/theme';

/** Toast region, themed with the app. Toasts are announced politely by sonner. */
export function Toaster() {
  const theme = useThemeStore((state) => state.resolved);
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: 'border border-border bg-surface-raised text-text shadow-md',
          description: 'text-muted',
        },
      }}
    />
  );
}
