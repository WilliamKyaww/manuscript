import { Facet } from '@codemirror/state';
import { fileUrl } from '@skb/core';

/**
 * What live preview needs to know about the vault to draw an embed (Phase 25): which attachment a
 * `![[name.png]]` names. The editor knows the vault's attachments (the same list its completions use).
 */
export interface LivePreviewContext {
  /** The address of the image an embed target names, or null when it is not a known image. */
  imageUrl(target: string): string | null;
}

const NONE: LivePreviewContext = { imageUrl: () => null };

export const livePreviewContext = Facet.define<LivePreviewContext, LivePreviewContext>({
  combine: (values) => values[0] ?? NONE,
});

const IMAGE = /\.(?:png|jpe?g|gif|svg|webp|avif|bmp)$/iu;

export function isImageName(name: string): boolean {
  return IMAGE.test(name);
}

/** A context over the attachments list: by file name, or by the path the target gives. */
export function contextFromAttachments(
  attachments: () => readonly { name: string; folder: string }[],
): LivePreviewContext {
  return {
    imageUrl(target) {
      const wanted = target.trim().replace(/^\/+/u, '').toLowerCase();
      if (!isImageName(wanted)) return null;
      const found = attachments().find((item) => {
        const path = (item.folder ? `${item.folder}/${item.name}` : item.name).toLowerCase();
        return path === wanted || (!wanted.includes('/') && item.name.toLowerCase() === wanted);
      });
      if (!found) return null;
      return fileUrl(found.folder ? `${found.folder}/${found.name}` : found.name);
    },
  };
}
