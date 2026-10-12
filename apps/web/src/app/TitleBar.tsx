import { useEffect, useState } from 'react';
import { desktopBridge } from '../lib/desktop';
import { useAppearance } from './theme/appearance';
import { useThemeStore } from './theme/theme';

/**
 * The desktop app's slim title bar (task 23.10, ADR-0042): the window has no system title bar, only
 * the system's own minimise, maximise and close buttons over the top right, so the page draws a
 * 32-pixel strip in its own colours that the window is dragged by, with the page's title. The
 * buttons' colours follow the theme. In a browser there is no strip.
 */

export const TITLE_BAR_HEIGHT = 32;

/** A colour as `#rrggbb`, which the window accepts, from any CSS colour (when there is a canvas). */
function hexColour(value: string): string {
  const context = document.createElement('canvas').getContext?.('2d');
  if (!context) return value;
  context.fillStyle = value;
  return context.fillStyle;
}

function useDocumentTitle(): string {
  const [title, setTitle] = useState(document.title);
  useEffect(() => {
    const element = document.querySelector('title');
    if (!element) return;
    const observer = new MutationObserver(() => setTitle(document.title));
    observer.observe(element, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return title;
}

export function TitleBar() {
  const bridge = desktopBridge();
  const theme = useThemeStore((state) => state.resolved);
  const palette = useAppearance((state) => state.palette);
  const title = useDocumentTitle();

  // biome-ignore lint/correctness/useExhaustiveDependencies: the colours are read again from the page whenever the theme or palette changes.
  useEffect(() => {
    if (!bridge) return;
    const styles = getComputedStyle(document.documentElement);
    void bridge
      .setTitleBarColours({
        background: hexColour(styles.getPropertyValue('--skb-surface').trim()),
        symbols: hexColour(styles.getPropertyValue('--skb-text').trim()),
      })
      .catch(() => undefined);
  }, [bridge, theme, palette]);

  if (!bridge) return null;
  return (
    <div
      data-title-bar
      className="flex flex-none items-center gap-2 border-b border-divider bg-surface pl-3 text-xs text-muted select-none [-webkit-app-region:drag]"
      style={{
        height: TITLE_BAR_HEIGHT,
        // Leave room for the window's buttons, wherever the system draws them.
        paddingRight:
          'calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, calc(100vw - 9rem)))',
      }}
    >
      <img src="/favicon.svg" alt="" className="size-4" />
      <span className="truncate">{title}</span>
    </div>
  );
}
