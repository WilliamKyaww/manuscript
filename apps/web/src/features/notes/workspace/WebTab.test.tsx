import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from 'radix-ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebTab } from './WebTab';
import { useWebPages } from './web-pages';

const bridge = vi.hoisted(() => ({
  open: vi.fn().mockResolvedValue(true),
  place: vi.fn().mockResolvedValue(undefined),
  command: vi.fn().mockResolvedValue(undefined),
  snapshot: vi.fn().mockResolvedValue(null),
  release: vi.fn().mockResolvedValue(undefined),
  onState: vi.fn().mockReturnValue(() => undefined),
}));
vi.mock('../../../lib/desktop', () => ({ desktopBridge: () => ({ web: bridge }) }));

const url = 'https://example.org/paper';
const tab = { id: 'paper', noteId: null, url };
const page = { url, title: 'Paper', loading: false, canGoBack: true, canGoForward: false };
const showTab = () =>
  render(
    <Tooltip.Provider>
      <WebTab tab={tab} />
    </Tooltip.Provider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  useWebPages.setState({ pages: {} });
});

describe('the desktop web tab', () => {
  it('keeps an HTTP verification response in its native host and offers recovery above it', async () => {
    useWebPages.setState({ pages: { paper: { ...page, issue: { kind: 'http', code: 403 } } } });
    const { container } = showTab();
    expect(screen.getByRole('status')).toHaveTextContent(/verification|restricted/iu);
    expect(screen.getByText(/HTTP 403/u)).toBeVisible();
    expect(container.querySelector('[data-web-view-host]')).toBeInTheDocument();
    await waitFor(() => expect(bridge.place).toHaveBeenCalledWith('paper', expect.any(Object)));
    expect(bridge.place).not.toHaveBeenCalledWith('paper', null);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(bridge.command).toHaveBeenCalledWith('paper', 'load', url);
  });

  it('hides a failed native load, retains its attempted address and opens that address externally', async () => {
    const attempted = 'https://example.org/unreachable';
    useWebPages.setState({
      pages: { paper: { ...page, url: attempted, issue: { kind: 'load', code: -105 } } },
    });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    showTab();
    expect(screen.getByRole('status')).toHaveTextContent('could not be loaded');
    expect(screen.getByRole('textbox', { name: 'Address' })).toHaveValue(attempted);
    await waitFor(() => expect(bridge.place).toHaveBeenCalledWith('paper', null));
    await userEvent.click(screen.getByRole('button', { name: 'Open in system browser' }));
    expect(open).toHaveBeenCalledWith(attempted, '_blank', 'noopener,noreferrer');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(bridge.command).toHaveBeenCalledWith('paper', 'load', attempted);
    open.mockRestore();
  });

  it('restores the native host and removes the warning after a successful navigation', async () => {
    useWebPages.setState({ pages: { paper: { ...page, issue: { kind: 'crash', code: 1 } } } });
    showTab();
    expect(screen.getByRole('status')).toHaveTextContent('stopped unexpectedly');
    await waitFor(() => expect(bridge.place).toHaveBeenCalledWith('paper', null));
    act(() => useWebPages.setState({ pages: { paper: { ...page, issue: null } } }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await waitFor(() => expect(bridge.place).toHaveBeenLastCalledWith('paper', expect.any(Object)));
  });
});
