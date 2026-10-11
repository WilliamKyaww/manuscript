import { type KeyboardEvent, type PointerEvent, useRef } from 'react';
import { cn } from '../lib/cn';
import { SIDEBAR_WIDTH, useLayoutStore } from './layout-store';

/**
 * The open sidebar's right edge (task 23.01): drag it to resize, double-click it to go back to the
 * usual width; with the keyboard it is a separator whose arrows change the width. The width is
 * remembered once a drag ends.
 */
export function SidebarResizer({ onResizing }: { onResizing(resizing: boolean): void }) {
  const width = useLayoutStore((state) => state.sidebarWidth);
  const setWidth = useLayoutStore((state) => state.setSidebarWidth);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
    onResizing(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setWidth(drag.current.startWidth + event.clientX - drag.current.startX, false);
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setWidth(useLayoutStore.getState().sidebarWidth, true);
    onResizing(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 16;
    const next =
      event.key === 'ArrowLeft'
        ? width - step
        : event.key === 'ArrowRight'
          ? width + step
          : event.key === 'Home'
            ? SIDEBAR_WIDTH.min
            : event.key === 'End'
              ? SIDEBAR_WIDTH.max
              : event.key === 'Enter'
                ? SIDEBAR_WIDTH.default
                : null;
    if (next === null) return;
    event.preventDefault();
    setWidth(next);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable, adjustable separator has no element of its own (<hr> cannot take focus).
    <div
      role="separator"
      tabIndex={0}
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-controls="sidebar"
      aria-valuemin={SIDEBAR_WIDTH.min}
      aria-valuemax={SIDEBAR_WIDTH.max}
      aria-valuenow={width}
      title="Drag to resize · double-click to reset"
      data-sidebar-resizer
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => setWidth(SIDEBAR_WIDTH.default)}
      onKeyDown={onKeyDown}
      className={cn(
        'absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none outline-none',
        'after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent',
        'after:transition-colors hover:after:bg-accent focus-visible:after:w-0.5 focus-visible:after:bg-focus',
      )}
    />
  );
}
