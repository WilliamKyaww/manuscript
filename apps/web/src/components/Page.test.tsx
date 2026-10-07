import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Page, StickySection } from './Page';
import { Pane } from './Pane';

describe('Page', () => {
  it('keeps the header outside the only scroll container (sticky-header rule)', () => {
    const { container } = render(
      <Page
        title="Notes"
        description="All your notes"
        actions={<button type="button">New note</button>}
        toolbar={<div>Filters</div>}
      >
        <p>Body content</p>
      </Page>,
    );
    const header = container.querySelector('[data-page-header]');
    const body = container.querySelector('[data-page-body]');
    expect(header).not.toBeNull();
    expect(body).not.toBeNull();
    // The header is a sibling of the body, never inside it.
    expect(body?.contains(header ?? null)).toBe(false);
    expect(header?.parentElement).toBe(body?.parentElement);
    // Only the body scrolls; the header does not shrink.
    expect(body?.className).toContain('overflow-y-auto');
    expect(header?.className).toContain('flex-none');
    // Title, actions and toolbar all live in the fixed header.
    const scope = within(header as HTMLElement);
    expect(scope.getByRole('heading', { level: 1, name: 'Notes' })).toHaveAttribute(
      'data-page-title',
    );
    expect(scope.getByRole('button', { name: 'New note' })).toBeInTheDocument();
    expect(scope.getByText('Filters')).toBeInTheDocument();
    expect(within(body as HTMLElement).getByText('Body content')).toBeInTheDocument();
  });

  it('sets the document title', () => {
    render(<Page title="Settings">x</Page>);
    expect(document.title).toBe('Settings · Study Knowledge Base');
  });

  it('renders exactly one level-one heading', () => {
    render(
      <Page title="Today">
        <StickySection title="Section">content</StickySection>
      </Page>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});

describe('Page with panes', () => {
  it('gives every pane a fixed header outside its own scroll container', () => {
    const { container } = render(
      <Page title="Notes" layout="panes">
        <Pane title="Files" actions={<button type="button">New</button>}>
          <p>Tree</p>
        </Pane>
        <Pane title="Editor" hideTitle toolbar={<div>Modes</div>}>
          <p>Text</p>
        </Pane>
      </Page>,
    );
    const body = container.querySelector('[data-page-body]');
    expect(body?.getAttribute('data-layout')).toBe('panes');
    expect(body?.className).toContain('overflow-hidden');
    const panes = container.querySelectorAll('[data-pane]');
    expect(panes).toHaveLength(2);
    for (const pane of panes) {
      const header = pane.querySelector('[data-pane-header]');
      const paneBody = pane.querySelector('[data-pane-body]');
      expect(paneBody?.contains(header ?? null)).toBe(false);
      expect(header?.className).toContain('flex-none');
      expect(paneBody?.className).toContain('overflow-y-auto');
    }
    expect(screen.getByRole('region', { name: 'Files' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Editor' })).toBeInTheDocument();
    expect(screen.getByText('Modes').closest('[data-pane-toolbar]')).not.toBeNull();
  });
});

describe('StickySection', () => {
  it('has a sticky header and is labelled by its heading', () => {
    const { container } = render(
      <StickySection
        title="Appearance"
        description="Theme and density"
        actions={<button type="button">Reset</button>}
      >
        <p>Options</p>
      </StickySection>,
    );
    const header = container.querySelector('[data-sticky-header]');
    expect(header?.className).toMatch(/\bsticky\b/);
    expect(header?.className).toMatch(/\btop-0\b/);
    expect(screen.getByRole('region', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });
});
