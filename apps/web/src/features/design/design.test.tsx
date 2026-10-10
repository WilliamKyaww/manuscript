import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import tokensCss from '../../styles/tokens.css?raw';
import { type FakeFetch, HEALTH, renderApp, resetUiState } from '../../test/renderApp';
import { COLOUR_GROUPS, RADII, SHADOWS } from './tokens';

const fetch: FakeFetch = async (input) => {
  const path = new URL(String(input), 'http://localhost').pathname;
  if (path === '/api/health') return new Response(JSON.stringify(HEALTH));
  return new Response(JSON.stringify({ title: 'Not found', status: 404 }), { status: 404 });
};

beforeEach(() => resetUiState());

describe('the design system page', () => {
  it('lists every token that tokens.css defines', () => {
    const defined = new Set([...tokensCss.matchAll(/--skb-([a-z0-9-]+):/g)].map((m) => m[1]));
    // Not shown as swatches: fonts, layout sizes and motion.
    const other = /^(font-|sidebar-|duration-|ease$)/;
    const listed = new Set<string>([
      ...COLOUR_GROUPS.flatMap((group) => group.tokens),
      ...RADII,
      ...SHADOWS,
    ]);
    const missing = [...defined].filter(
      (token) => !other.test(token as string) && !listed.has(token as string),
    );
    const unknown = [...listed].filter((token) => !defined.has(token));
    expect({ missing, unknown }).toEqual({ missing: [], unknown: [] });
  });

  it('shows the tokens and components, and a delete that asks first', async () => {
    renderApp('/design-system', fetch);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Design system' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Accent' })).toHaveTextContent('accent-subtle');
    expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Delete…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete the example?' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
