import { fileUrl } from '@skb/core';
import { FileText } from 'lucide-react';

/** Embedded vault files: PDFs in a frame, audio and video players, and a link card for the rest. */
export function FileEmbed({
  path,
  mediaType,
  fragment,
}: {
  path: string;
  mediaType: string;
  fragment: string | null;
}) {
  const url = fileUrl(path);
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (mediaType === 'application/pdf') {
    // `#page=3` is understood by browsers' PDF viewers.
    return (
      <iframe
        className="embed-pdf"
        src={fragment ? `${url}#${fragment}` : url}
        title={`PDF: ${name}`}
        loading="lazy"
      />
    );
  }
  if (mediaType.startsWith('audio/')) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: vault recordings have no caption files; the native controls remain usable.
      <audio className="embed-media" controls preload="metadata" src={url}>
        <a href={url}>{name}</a>
      </audio>
    );
  }
  if (mediaType.startsWith('video/')) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: vault videos have no caption files; the native controls remain usable.
      <video className="embed-media" controls preload="metadata" src={url}>
        <a href={url}>{name}</a>
      </video>
    );
  }
  return (
    <a className="embed-file" href={url} target="_blank" rel="noreferrer noopener">
      <FileText aria-hidden="true" size={16} />
      <span>{name}</span>
    </a>
  );
}
