import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

/** happy-dom lays nothing out, so the heights a long dialogue would have are stood in for. */
function heights(scroll: number, client: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scroll);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(client);
}

afterEach(() => vi.restoreAllMocks());

describe('Dialog', () => {
  it('makes a body that scrolls reachable from the keyboard, as a named region', () => {
    heights(900, 400);
    render(
      <Dialog open onOpenChange={() => {}} title="Keyboard shortcuts">
        <p>A long list</p>
      </Dialog>,
    );
    expect(screen.getByRole('region', { name: 'Keyboard shortcuts' })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it('leaves a long form alone: its fields bring it along', () => {
    heights(900, 400);
    render(
      <Dialog open onOpenChange={() => {}} title="New question">
        <label>
          Question <textarea />
        </label>
      </Dialog>,
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('leaves a body that fits out of the tab order', () => {
    heights(200, 400);
    render(
      <Dialog open onOpenChange={() => {}} title="Rename">
        <p>Short</p>
      </Dialog>,
    );
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});
