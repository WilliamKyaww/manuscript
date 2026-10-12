import { EditorView } from '@codemirror/view';

/**
 * How live preview looks (Phase 25), in the application's tokens so that every palette and theme
 * follows. Included with the live preview extension, so Source mode shows none of it.
 */

/** A callout's colours: the border and icon (`--callout`) and the tint behind it. */
const calloutColours = (colour: string) => ({
  '--callout': colour,
  '--callout-bg': `color-mix(in srgb, ${colour} 12%, transparent)`,
});

const highlight = (colour: string) => ({
  backgroundColor: `color-mix(in srgb, ${colour} 32%, transparent)`,
});

export const liveTheme = EditorView.theme({
  // Lists: a bullet or number in a box of one width, wrapped lines hanging under the text.
  '.cm-list-line': {
    paddingLeft: 'calc(24px + var(--list-depth, 0) * 1.5em + 1.5em)',
    textIndent: '-1.5em',
  },
  '.cm-list-bullet, .cm-list-number': {
    display: 'inline-block',
    width: '1.5em',
    textIndent: '0',
    color: 'var(--skb-text-muted)',
  },
  '.cm-list-bullet': { fontSize: '1.15em', lineHeight: '1', verticalAlign: '-0.05em' },
  '.cm-list-number': { fontVariantNumeric: 'tabular-nums' },

  // Tasks.
  '.cm-task-box': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    width: '1.05em',
    height: '1.05em',
    marginRight: '0.45em',
    border: '1.5px solid var(--skb-border-strong)',
    borderRadius: '4px',
    fontSize: '0.8em',
    fontWeight: '700',
    lineHeight: '1',
    textIndent: '0',
    verticalAlign: '-0.15em',
    cursor: 'pointer',
    userSelect: 'none',
  },
  '.cm-task-box[aria-checked="true"]': {
    backgroundColor: 'var(--skb-accent)',
    borderColor: 'var(--skb-accent)',
    color: 'var(--skb-accent-contrast)',
  },
  '.cm-task-done': { color: 'var(--skb-text-muted)', textDecoration: 'line-through' },

  // Quotes and callouts.
  '.cm-quote': {
    marginLeft: '24px',
    paddingLeft: '0.75em !important',
    borderLeft: '3px solid var(--skb-border-strong)',
    color: 'var(--skb-text-muted)',
  },
  '.cm-callout': {
    ...calloutColours('var(--skb-info)'),
    marginLeft: '24px',
    marginRight: '24px',
    paddingLeft: '0.9em !important',
    paddingRight: '0.9em !important',
    borderLeft: '4px solid var(--callout)',
    backgroundColor: 'var(--callout-bg)',
  },
  '.cm-callout[data-callout="tip"], .cm-callout[data-callout="success"]':
    calloutColours('var(--skb-success)'),
  '.cm-callout[data-callout="warning"], .cm-callout[data-callout="question"]':
    calloutColours('var(--skb-warning)'),
  '.cm-callout[data-callout="failure"], .cm-callout[data-callout="danger"], .cm-callout[data-callout="bug"]':
    calloutColours('var(--skb-danger)'),
  '.cm-callout[data-callout="example"]': calloutColours('var(--skb-graph-4)'),
  '.cm-callout[data-callout="quote"]': calloutColours('var(--skb-text-subtle)'),
  '.cm-callout[data-callout-first]': {
    paddingTop: '0.35em',
    borderTopRightRadius: 'var(--skb-radius-md)',
    fontWeight: '650',
  },
  '.cm-callout-head': {
    display: 'inline-flex',
    alignItems: 'center',
    fontWeight: '650',
    color: 'var(--skb-text)',
  },
  // A margin, not a gap: a title the note wrote is a separate element after the widget.
  '.cm-callout-icon': { display: 'inline-flex', marginRight: '0.5em', color: 'var(--callout)' },
  '.cm-callout-title': { fontWeight: '650' },

  '.cm-hr': {
    color: 'transparent',
    backgroundImage: 'linear-gradient(var(--skb-border-strong), var(--skb-border-strong))',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    backgroundSize: 'calc(100% - 48px) 2px',
  },

  // Code blocks: a well of their own, the fences quiet.
  '.cm-codeblock': {
    backgroundColor: 'var(--skb-surface-sunken)',
    fontFamily: 'var(--skb-font-mono)',
    fontSize: '0.9em',
    lineHeight: '1.55',
  },
  '.cm-codeblock-first': {
    paddingTop: '6px',
    borderTopLeftRadius: 'var(--skb-radius-md)',
    borderTopRightRadius: 'var(--skb-radius-md)',
    color: 'var(--skb-text-subtle)',
  },
  '.cm-codeblock-last': {
    paddingBottom: '6px',
    borderBottomLeftRadius: 'var(--skb-radius-md)',
    borderBottomRightRadius: 'var(--skb-radius-md)',
    color: 'var(--skb-text-subtle)',
  },

  // Inline elements.
  '.cm-highlight': { ...highlight('var(--skb-warning)'), borderRadius: '3px' },
  '.cm-hl-red': highlight('var(--skb-danger)'),
  '.cm-hl-orange': highlight('var(--skb-warning)'),
  '.cm-hl-yellow': highlight('var(--skb-stage-practised)'),
  '.cm-hl-green': highlight('var(--skb-success)'),
  '.cm-hl-blue': highlight('var(--skb-info)'),
  '.cm-hl-purple': highlight('var(--skb-graph-4)'),
  '.cm-comment': { color: 'var(--skb-text-subtle)', fontStyle: 'italic' },
  '.cm-footnote-ref': {
    color: 'var(--skb-accent)',
    fontSize: '0.75em',
    verticalAlign: 'super',
  },
  '.cm-footnote-label': { color: 'var(--skb-text-muted)', fontWeight: '600' },
  '.cm-inline-footnote': { color: 'var(--skb-text-muted)' },
  '.cm-block-id': { color: 'var(--skb-text-subtle)', fontSize: '0.85em' },
  '.cm-embed': { color: 'var(--skb-accent)' },
  '.cm-embed-image': {
    display: 'inline-block',
    maxWidth: '100%',
    verticalAlign: 'middle',
    borderRadius: '4px',
  },
  '.cm-math-source, .cm-table-source': {
    fontFamily: 'var(--skb-font-mono)',
    fontSize: '0.9em',
  },
  '.cm-math-display': { padding: '0.5em 24px', textAlign: 'center', overflowX: 'auto' },
  '.cm-math[data-pending]': { color: 'var(--skb-text-muted)' },

  // Tables, drawn as tables.
  '.cm-table-widget': { margin: '0.5em 24px', overflowX: 'auto' },
  '.cm-table-widget table': { borderCollapse: 'collapse', cursor: 'text' },
  '.cm-table-widget th, .cm-table-widget td': {
    border: '1px solid var(--skb-border-strong)',
    padding: '0.35em 0.8em',
    textAlign: 'left',
    verticalAlign: 'top',
  },
  '.cm-table-widget th': { backgroundColor: 'var(--skb-surface-sunken)', fontWeight: '650' },
  '.cm-table-widget code': {
    fontFamily: 'var(--skb-font-mono)',
    fontSize: '0.9em',
  },
  '.cm-cell-link': { color: 'var(--skb-accent)' },
});
