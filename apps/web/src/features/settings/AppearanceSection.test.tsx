import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppearance } from '../../app/theme/appearance';
import { AppearanceSection } from './AppearanceSection';

/** Settings → Appearance (Phase 24): the palette and Simplified UI apply at once and are remembered. */

const root = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  useAppearance.setState({ palette: 'manuscript', simplified: true });
});

describe('Settings → Appearance', () => {
  it('offers six palettes, with the current one chosen', () => {
    render(<AppearanceSection />);
    const palettes = screen.getByRole('radiogroup', { name: 'Palette' });
    const options = palettes.querySelectorAll('[role="radio"]');
    expect(options).toHaveLength(6);
    expect(screen.getByRole('radio', { name: /^Manuscript/u })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Iris/u })).toHaveAccessibleDescription(
      'Violet-tinted neutrals with a muted iris accent.',
    );
  });

  it('changes the palette at once and remembers it', async () => {
    const user = userEvent.setup();
    render(<AppearanceSection />);
    await user.click(screen.getByRole('radio', { name: /^Slate/u }));
    expect(root.dataset.palette).toBe('slate');
    expect(localStorage.getItem('skb.palette')).toBe('slate');
    expect(screen.getByRole('radio', { name: /^Slate/u })).toBeChecked();
  });

  it('turns Simplified UI off and on, saying what it does', async () => {
    const user = userEvent.setup();
    render(<AppearanceSection />);
    const toggle = screen.getByRole('switch', { name: 'Simplified UI' });
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAccessibleDescription(
      'Reduce visual clutter and simplify the interface without removing features or functionality.',
    );
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(root.dataset.ui).toBe('standard');
    expect(localStorage.getItem('skb.ui')).toBe('standard');
    await user.click(toggle);
    expect(root.dataset.ui).toBe('simplified');
  });
});
