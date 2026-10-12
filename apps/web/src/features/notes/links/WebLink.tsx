import './links.css';
import { HoverCard } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../../../lib/cn';
import { externalUrl, openInBrowser, openWebLink, wantsBrowser } from './external';
import { githubLabel, parseGitHubUrl } from './github';
import { GitHubMark } from './github-mark';
import { LinkCard } from './LinkCard';

/**
 * A link to the web in the reading view (Phase 26): the external-link mark after it (as in
 * Obsidian), GitHub links as mentions, and the link card on hover or focus. A click opens the page
 * beside the note (when `paneId` says which note's pane this is and the desktop app can); Ctrl+click,
 * a middle click or the card's button use the system browser.
 */

export function WebLink({
  href,
  text,
  paneId,
  className,
  children,
}: {
  href: string;
  /** The link's words as plain text, to tell a bare address from words the note chose. */
  text: string;
  paneId?: string;
  className?: string;
  children?: ReactNode;
}) {
  // The address as written stays on the link; the one opened is the full web address.
  const target = externalUrl(href) ?? href;
  const github = parseGitHubUrl(target);
  const label = github ? githubLabel(github, text, target) : null;
  return (
    <HoverCard.Root openDelay={350} closeDelay={150}>
      <HoverCard.Trigger asChild>
        <a
          href={/^https?:\/\//iu.test(href) ? href : target}
          target="_blank"
          rel="noreferrer noopener"
          title={github ? github.title : undefined}
          className={cn(
            github ? 'github-link' : 'external-link',
            github && label === github.label && 'github-mention',
            className,
          )}
          onClick={(event) => {
            // Ctrl+click and the like keep the browser's own behaviour (a new tab, outside).
            if (wantsBrowser(event)) return;
            event.preventDefault();
            if (paneId) openWebLink(target, { paneId });
            else openInBrowser(target);
          }}
        >
          {github ? (
            <>
              <GitHubMark size={14} className="github-mark" />
              <span>{label}</span>
            </>
          ) : (
            children
          )}
        </a>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 animate-fade-in"
        >
          <LinkCard url={target} />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}
