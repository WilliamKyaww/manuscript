/**
 * The colour tokens of `styles/tokens.css`, grouped as the design-system page shows them. A test
 * checks that every token defined there is listed here, so the page cannot fall behind the CSS.
 */

export interface TokenGroup {
  title: string;
  description: string;
  tokens: readonly string[];
}

export const COLOUR_GROUPS: readonly TokenGroup[] = [
  {
    title: 'Surfaces and borders',
    description: 'Warm paper neutrals: the page, cards, sunken wells, hover, hairlines.',
    tokens: [
      'bg',
      'surface',
      'surface-raised',
      'surface-sunken',
      'surface-hover',
      'border',
      'border-strong',
      'overlay',
    ],
  },
  {
    title: 'Text',
    description: 'All three meet WCAG AA (4.5:1) on every surface; subtle is for secondary text.',
    tokens: ['text', 'text-muted', 'text-subtle'],
  },
  {
    title: 'Accent',
    description: 'One green, for primary actions, links, focus and selection.',
    tokens: ['accent', 'accent-hover', 'accent-subtle', 'accent-contrast', 'focus'],
  },
  {
    title: 'Status',
    description: 'Each with a subtle background for badges and banners.',
    tokens: [
      'success',
      'success-subtle',
      'warning',
      'warning-subtle',
      'danger',
      'danger-subtle',
      'danger-contrast',
      'info',
      'info-subtle',
    ],
  },
  {
    title: 'Mastery stages',
    description: 'From not started to mastered: lightness changes as well as hue.',
    tokens: ['stage-new', 'stage-learning', 'stage-practised', 'stage-confident', 'stage-mastered'],
  },
  {
    title: 'Graph',
    description: 'Ten community colours, then nodes in none, course structure and edges.',
    tokens: [
      'graph-1',
      'graph-2',
      'graph-3',
      'graph-4',
      'graph-5',
      'graph-6',
      'graph-7',
      'graph-8',
      'graph-9',
      'graph-10',
      'graph-node',
      'graph-structure',
      'graph-edge',
      'graph-edge-strong',
    ],
  },
];

export const RADII = ['radius-sm', 'radius-md', 'radius-lg'] as const;
export const SHADOWS = ['shadow-sm', 'shadow-md', 'shadow-lg'] as const;
