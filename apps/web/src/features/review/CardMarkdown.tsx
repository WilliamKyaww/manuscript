import { MarkdownPreview } from '../notes/preview/MarkdownPreview';
import { useLinkResolve } from '../notes/preview/useLinkResolve';

/** A card face's Markdown, rendered like a note (maths, code, links to notes and concepts). */
export function CardMarkdown({
  content,
  cardId,
  className,
}: {
  content: string;
  cardId: string;
  className?: string;
}) {
  const resolve = useLinkResolve();
  return (
    <MarkdownPreview content={content} resolve={resolve} noteId={cardId} className={className} />
  );
}
