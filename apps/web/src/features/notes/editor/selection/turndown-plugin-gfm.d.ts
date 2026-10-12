// turndown-plugin-gfm 1.0.2 ships no types: the plugins it exports take a TurndownService.
declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';

  type Plugin = (service: TurndownService) => void;
  export const gfm: Plugin;
  export const tables: Plugin;
  export const strikethrough: Plugin;
  export const taskListItems: Plugin;
  export const highlightedCodeBlock: Plugin;
}
