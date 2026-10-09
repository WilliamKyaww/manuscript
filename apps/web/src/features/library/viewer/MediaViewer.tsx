import { fileUrl, type SourceSection, type SourceSummary } from '@skb/core';
import { useEffect, useRef, useState } from 'react';
import { Pane } from '../../../components/Pane';
import { EmptyState } from '../../../components/States';
import { cn } from '../../../lib/cn';

/**
 * Recordings (task 11.10): the player beside its transcript. A section's time opens the recording
 * there (`?t=` in the address, which citations and generated cards use), and the section being
 * played is highlighted as the recording plays.
 */
export function MediaViewer({
  source,
  sections,
  time,
  onNavigate,
}: {
  source: SourceSummary;
  sections: readonly SourceSection[];
  /** Seconds to start at. */
  time: number | undefined;
  onNavigate(seconds: number): void;
}) {
  const player = useRef<HTMLMediaElement | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const [now, setNow] = useState(time ?? 0);
  const startOf = (section: SourceSection) =>
    section.locator.kind === 'media' ? section.locator.startMs / 1000 : 0;
  const current = [...sections].reverse().find((section) => startOf(section) <= now + 0.25);

  useEffect(() => {
    if (time === undefined || !player.current) return;
    if (Math.abs(player.current.currentTime - time) > 1) player.current.currentTime = time;
    list.current
      ?.querySelector(`[data-start="${Math.floor(time)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [time]);

  const seek = (seconds: number) => {
    if (player.current) {
      player.current.currentTime = seconds;
      void player.current.play().catch(() => {
        // Autoplay may be refused; the position is set either way.
      });
    }
    onNavigate(Math.floor(seconds));
  };

  const shared = {
    controls: true,
    preload: 'metadata' as const,
    src: fileUrl(source.path),
    onTimeUpdate: (event: { currentTarget: HTMLMediaElement }) =>
      setNow(event.currentTarget.currentTime),
    onLoadedMetadata: (event: { currentTarget: HTMLMediaElement }) => {
      if (time !== undefined) event.currentTarget.currentTime = time;
    },
  };
  return (
    <Pane
      title="Recording"
      className="min-w-0 flex-1"
      bodyClassName="flex flex-col overflow-hidden"
    >
      <div className="flex-none border-b border-border bg-surface-sunken p-4">
        {source.kind === 'video' ? (
          <video
            ref={(element) => {
              player.current = element;
            }}
            className="mx-auto max-h-[40vh] w-full max-w-3xl rounded-md bg-black"
            {...shared}
          />
        ) : (
          <audio
            ref={(element) => {
              player.current = element;
            }}
            className="w-full"
            {...shared}
          />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" data-scroll-region>
        {sections.length === 0 ? (
          <EmptyState
            title="No transcript yet"
            description="Recordings are transcribed when a transcription model is set up in Settings → AI; then choose “Read again”."
          />
        ) : (
          <ol ref={list} aria-label="Transcript" className="mx-auto max-w-3xl space-y-1 p-4">
            {sections.map((section) => {
              const start = startOf(section);
              const playing = section === current;
              return (
                <li
                  key={section.ordinal}
                  data-start={Math.floor(start)}
                  className={cn('flex gap-3 rounded-md px-2 py-1.5', playing && 'bg-accent-subtle')}
                >
                  <button
                    type="button"
                    onClick={() => seek(start)}
                    aria-label={`Play from ${section.label}`}
                    aria-current={playing ? 'time' : undefined}
                    className="h-fit shrink-0 rounded px-1 font-mono text-xs text-accent tabular-nums hover:underline"
                  >
                    {section.label}
                  </button>
                  <p className="text-sm leading-relaxed">{section.text}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Pane>
  );
}

/** Images (task 11.11): the picture and the text read from it. */
export function ImageViewer({
  source,
  sections,
}: {
  source: SourceSummary;
  sections: readonly SourceSection[];
}) {
  const text = sections.map((section) => section.text).join('\n\n');
  return (
    <Pane title="Image" className="min-w-0 flex-1">
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <img
          src={fileUrl(source.path)}
          alt={text ? `${source.title}: ${text.slice(0, 200)}` : source.title}
          className="mx-auto max-h-[60vh] rounded-md border border-border"
        />
        {text ? (
          <section aria-label="Text read from the image" className="rounded-md bg-surface p-4">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
              Read by AI — check against the image
            </h3>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
          </section>
        ) : (
          <p className="text-center text-sm text-muted">
            No text has been read from this image yet.
          </p>
        )}
      </div>
    </Pane>
  );
}
