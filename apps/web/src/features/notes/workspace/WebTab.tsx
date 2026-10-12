import { ArrowLeft, ArrowRight, Copy, ExternalLink, Globe, RotateCw, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/Button';
import { IconButton } from '../../../components/IconButton';
import { EmptyState } from '../../../components/States';
import { desktopBridge } from '../../../lib/desktop';
import { notifySuccess } from '../../../lib/notify';
import { externalUrl, openInBrowser } from '../links/external';
import { useCovered } from './use-covered';
import { followWebPages, useWebPages } from './web-pages';
import type { WorkspaceTab } from './workspace-store';

/**
 * A web page in a tab (Phase 26, ADR-0045). The desktop app draws the page as a native view over the
 * box below the toolbar; this component keeps the box measured and tells the app where it is, and
 * shows a picture of the page while one of the window's own menus or dialogues would be hidden under
 * it. A browser cannot show other sites in a page, so there the tab offers to open it in a new tab.
 */

export function WebTab({ tab }: { tab: WorkspaceTab & { url: string } }) {
  const web = desktopBridge()?.web;
  if (!web)
    return (
      <div className="flex-1 overflow-y-auto">
        <EmptyState
          title="Web pages open beside notes in the desktop app"
          description={`A browser cannot show other sites inside a page, so ${new URL(tab.url).hostname} opens in a tab of its own.`}
          action={<Button onClick={() => openInBrowser(tab.url)}>Open in a new tab</Button>}
        />
      </div>
    );
  return <DesktopWebTab tab={tab} />;
}

function DesktopWebTab({ tab }: { tab: WorkspaceTab & { url: string } }) {
  const web = desktopBridge()?.web;
  const host = useRef<HTMLElement>(null);
  const page = useWebPages((state) => state.pages[tab.id]);
  const covered = useCovered(host, true);
  const [picture, setPicture] = useState<string | null>(null);
  const current = page?.url || tab.url;
  const [address, setAddress] = useState(current);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setAddress(current);
  }, [current]);

  // The page is opened once per tab (the app keeps it while the tab exists) and hidden when the tab
  // is not shown. Its address then follows the page, so a new address is not a reason to open again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: opened once per tab, at its first address.
  useEffect(() => {
    if (!web) return;
    followWebPages();
    void web.open(tab.id, tab.url);
    return () => void web.place(tab.id, null);
  }, [web, tab.id]);

  // Where the page goes: the box, measured whenever it moves or changes size.
  useEffect(() => {
    const element = host.current;
    if (!web || !element) return;
    if (covered) {
      let cancelled = false;
      void web.snapshot(tab.id).then((image) => {
        if (!cancelled) setPicture(image);
      });
      return () => {
        cancelled = true;
      };
    }
    setPicture(null);
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = element.getBoundingClientRect();
        void web.place(tab.id, {
          x: box.left,
          y: box.top,
          width: box.width,
          height: box.height,
        });
      });
    };
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener('resize', place);
    // A box can also move without changing size (a panel opening beside it): check now and then.
    let last = '';
    const watch = window.setInterval(() => {
      const box = element.getBoundingClientRect();
      const now = `${box.left},${box.top},${box.width},${box.height}`;
      if (now !== last) place();
      last = now;
    }, 250);
    place();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.clearInterval(watch);
      window.removeEventListener('resize', place);
    };
  }, [web, tab.id, covered]);

  if (!web) return null;
  const go = (event: FormEvent) => {
    event.preventDefault();
    editing.current = false;
    const typed = address.trim();
    const target = externalUrl(/^[a-z][a-z0-9+.-]*:/iu.test(typed) ? typed : `https://${typed}`);
    if (target) void web.command(tab.id, 'load', target);
    else setAddress(current);
  };
  const copy = async () => {
    await navigator.clipboard.writeText(current);
    notifySuccess('Link copied');
  };

  return (
    <div data-web-tab className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-10 flex-none items-center gap-0.5 border-b border-chrome-line px-1.5">
        <IconButton
          label="Back"
          icon={<ArrowLeft size={15} />}
          size="sm"
          disabled={!page?.canGoBack}
          onClick={() => void web.command(tab.id, 'back')}
        />
        <IconButton
          label="Forward"
          icon={<ArrowRight size={15} />}
          size="sm"
          disabled={!page?.canGoForward}
          onClick={() => void web.command(tab.id, 'forward')}
        />
        <IconButton
          label={page?.loading ? 'Stop loading' : 'Reload'}
          icon={page?.loading ? <X size={15} /> : <RotateCw size={14} />}
          size="sm"
          onClick={() => void web.command(tab.id, page?.loading ? 'stop' : 'reload')}
        />
        <form onSubmit={go} className="mx-1 flex min-w-0 flex-1">
          <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-surface-sunken px-2 text-sm focus-within:ring-2 focus-within:ring-focus">
            <Globe aria-hidden="true" size={13} className="shrink-0 text-subtle" />
            <span className="sr-only">Address</span>
            <input
              value={address}
              onFocus={(event) => {
                editing.current = true;
                event.currentTarget.select();
              }}
              onBlur={() => {
                editing.current = false;
                setAddress(current);
              }}
              onChange={(event) => setAddress(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') event.currentTarget.blur();
              }}
              spellCheck={false}
              className="h-7 min-w-0 flex-1 bg-transparent text-muted outline-none focus:text-text"
            />
          </label>
        </form>
        <IconButton
          label="Copy link"
          icon={<Copy size={14} />}
          size="sm"
          onClick={() => void copy()}
        />
        <IconButton
          label="Open in browser"
          icon={<ExternalLink size={14} />}
          size="sm"
          onClick={() => openInBrowser(current)}
        />
      </div>
      {page?.loading && (
        <div aria-hidden="true" className="h-0.5 flex-none overflow-hidden bg-accent-subtle">
          <div className="h-full w-1/3 animate-loading bg-accent motion-reduce:animate-none" />
        </div>
      )}
      <section
        ref={host}
        data-web-view-host
        className="relative min-h-0 flex-1 bg-white"
        aria-label={`Web page: ${page?.title || current}`}
      >
        {covered && picture && (
          <img
            src={picture}
            alt=""
            className="absolute inset-0 size-full object-cover object-left-top"
          />
        )}
      </section>
    </div>
  );
}
