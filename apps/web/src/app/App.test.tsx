import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { healthyFetch, renderApp, resetUiState } from '../test/renderApp';
import { SECTIONS } from './sections';

beforeEach(() => {
  resetUiState();
});

describe('application shell', () => {
  it('shows the Today page inside the shell with every section in the sidebar', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const section of SECTIONS) {
      expect(within(nav).getByRole('link', { name: section.label })).toBeInTheDocument();
    }
    expect(within(nav).getByRole('link', { name: 'Today' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('renders an honest placeholder for sections that are not built yet', async () => {
    renderApp('/practice');
    expect(await screen.findByRole('heading', { level: 1, name: 'Practice' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Practice arrives in Phase 9' })).toBeInTheDocument();
  });

  it('shows a not-found page inside the shell for unknown addresses', async () => {
    renderApp('/no/such/page');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('navigates with the sidebar and moves focus to the new page title', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    await user.click(screen.getByRole('link', { name: 'Settings' }));
    const heading = await screen.findByRole('heading', { level: 1, name: 'Settings' });
    await waitFor(() => expect(heading).toHaveFocus());
  });
});

describe('session gate', () => {
  it('explains how to sign in when the API answers 401', async () => {
    const problem = {
      type: 'urn:skb:problem:unauthenticated',
      title: 'Authentication required',
      status: 401,
      code: 'unauthenticated',
    };
    renderApp('/', async () => new Response(JSON.stringify(problem), { status: 401 }));
    expect(await screen.findByRole('heading', { name: 'Sign-in required' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('offers a retry when the server is unreachable, then loads the app', async () => {
    const user = userEvent.setup();
    let reachable = false;
    renderApp('/', async (input, init) => {
      if (!reachable) throw new TypeError('Failed to fetch');
      return healthyFetch(input, init);
    });
    expect(
      await screen.findByRole('heading', { name: 'Cannot reach the local server' }),
    ).toBeInTheDocument();
    reachable = true;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
  });
});

describe('keyboard and command palette', () => {
  it('opens the command palette with Ctrl+K and navigates to the chosen section', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' });
    await user.type(within(dialog).getByRole('combobox'), 'settings');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('collapses the sidebar with Ctrl+\\ and remembers it', async () => {
    const user = userEvent.setup();
    const { container } = renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    const sidebar = container.querySelector('[data-sidebar]');
    expect(sidebar).toHaveAttribute('data-collapsed', 'false');
    await user.keyboard('{Control>}\\{/Control}');
    expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    expect(localStorage.getItem('skb.sidebar.collapsed')).toBe('true');
    // Collapsed links keep their accessible names.
    expect(screen.getByRole('link', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('opens the shortcuts cheat sheet with ? and lists registered shortcuts', async () => {
    const user = userEvent.setup();
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    await user.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByText('Open the command palette')).toBeInTheDocument();
    expect(within(dialog).getByText('Collapse or expand the sidebar')).toBeInTheDocument();
  });
});

describe('settings', () => {
  it('shows vault and installation details from the server', async () => {
    renderApp('/settings');
    expect(await screen.findByText('Study Vault')).toBeInTheDocument();
    expect(screen.getByText('C:/Users/will/Documents/Study Vault')).toBeInTheDocument();
    expect(screen.getByText('SQLite 3.51.2, 1 migration applied')).toBeInTheDocument();
    expect(screen.getByText('2 min')).toBeInTheDocument();
  });

  it('switches and remembers the theme', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'matchMedia');
    renderApp('/settings');
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    await user.click(screen.getByRole('radio', { name: /Dark/ }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('skb.theme')).toBe('dark');
    await user.click(screen.getByRole('radio', { name: /Light/ }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
