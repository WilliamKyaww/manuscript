import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuEntry } from '../../../components/MenuEntries';
import { useNotesUi } from '../notes-store';
import { buildTree, type TreeNode } from './buildTree';
import { NoteTree, type NoteTreeActions } from './NoteTree';

const root = buildTree(
  {
    notes: [
      { id: 'note_a', path: 'Modules/Paxos.md', title: 'Paxos' },
      { id: 'note_b', path: 'Modules/Raft.md', title: 'Raft consensus' },
      { id: 'note_c', path: 'Index.md', title: 'Index' },
    ],
    folders: ['Modules', 'Empty'],
    attachments: [],
  },
  { attachments: false },
);

function renderTree(activePath: string | null = null) {
  const onMenu = vi.fn();
  const actions = {
    onOpen: vi.fn(),
    onOpenInNewTab: vi.fn(),
    onRename: vi.fn(),
    onMove: vi.fn(),
    onDelete: vi.fn(),
    onMenu,
    menuFor: (node: TreeNode | null, startRename: () => void): MenuEntry[] => [
      { label: node ? `Act on ${node.name}` : 'New note', onSelect: () => onMenu(node) },
      { label: 'Rename…', onSelect: startRename },
    ],
  } satisfies NoteTreeActions & { onMenu: unknown };
  render(<NoteTree root={root} activePath={activePath} {...actions} />);
  return actions;
}

beforeEach(() => {
  useNotesUi.setState({ expanded: new Set() });
});

describe('NoteTree', () => {
  it('is no tree while the vault is empty, only a message', () => {
    const empty = buildTree({ notes: [], folders: [], attachments: [] }, { attachments: false });
    render(
      <NoteTree
        root={empty}
        activePath={null}
        onOpen={vi.fn()}
        onOpenInNewTab={vi.fn()}
        onRename={vi.fn()}
        onMove={vi.fn()}
        onDelete={vi.fn()}
        menuFor={() => []}
      />,
    );
    // A tree must contain tree items (WAI-ARIA); an empty one is plain text.
    expect(screen.queryByRole('tree')).not.toBeInTheDocument();
    expect(screen.getByText('This vault has no notes yet.')).toBeInTheDocument();
  });

  it('is an accessible tree with levels, positions and expansion state', () => {
    renderTree();
    const tree = screen.getByRole('tree', { name: 'Notes and folders' });
    const items = screen.getAllByRole('treeitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Empty',
      'Modules',
      'Index',
    ]);
    expect(items[1]).toHaveAttribute('aria-expanded', 'false');
    expect(items[2]).toHaveAttribute('aria-level', '1');
    expect(items[2]).toHaveAttribute('aria-posinset', '3');
    expect(items[2]).toHaveAttribute('aria-setsize', '3');
    // One tab stop for the whole tree.
    expect(tree.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it('opens folders and notes with the keyboard', async () => {
    const user = userEvent.setup();
    const actions = renderTree();
    const [empty] = screen.getAllByRole('treeitem');
    empty?.focus();
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(screen.getByRole('treeitem', { name: 'Modules' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(screen.getByRole('treeitem', { name: 'Paxos' })).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(screen.getByRole('treeitem', { name: 'Raft (Raft consensus)' })).toHaveFocus(),
    );
    await user.keyboard('{Enter}');
    expect(actions.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'note_b' }));
    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(screen.getByRole('treeitem', { name: 'Modules' })).toHaveFocus());
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('treeitem', { name: 'Modules' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('jumps to items by typing their name', async () => {
    const user = userEvent.setup();
    renderTree();
    screen.getAllByRole('treeitem')[0]?.focus();
    await user.keyboard('i');
    await waitFor(() => expect(screen.getByRole('treeitem', { name: 'Index' })).toHaveFocus());
  });

  it('renames with F2 and deletes with Delete', async () => {
    const user = userEvent.setup();
    const actions = renderTree();
    screen.getByRole('treeitem', { name: 'Index' }).focus();
    await user.keyboard('{F2}');
    const input = screen.getByRole('textbox', { name: 'New name' });
    await user.clear(input);
    await user.type(input, 'Home{Enter}');
    expect(actions.onRename).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'Index.md' }),
      'Home',
    );

    screen.getByRole('treeitem', { name: 'Index' }).focus();
    await user.keyboard('{F2}');
    await user.keyboard('{Escape}');
    expect(actions.onRename).toHaveBeenCalledTimes(1);

    screen.getByRole('treeitem', { name: 'Index' }).focus();
    await user.keyboard('{Delete}');
    expect(actions.onDelete).toHaveBeenCalledWith(expect.objectContaining({ path: 'Index.md' }));
  });

  it('marks the open note as selected', () => {
    useNotesUi.setState({ expanded: new Set(['Modules']) });
    renderTree('Modules/Paxos.md');
    expect(screen.getByRole('treeitem', { name: 'Paxos' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('treeitem', { name: 'Paxos' })).toHaveAttribute('tabindex', '0');
  });

  it('opens a note in a new tab with Ctrl+click or a middle click (task 23.09)', async () => {
    const user = userEvent.setup();
    const actions = renderTree();
    await user.keyboard('{Control>}');
    await user.click(screen.getByRole('treeitem', { name: 'Index' }));
    await user.keyboard('{/Control}');
    expect(actions.onOpenInNewTab).toHaveBeenCalledWith(expect.objectContaining({ id: 'note_c' }));
    expect(actions.onOpen).not.toHaveBeenCalled();
    fireEvent(
      screen.getByRole('treeitem', { name: 'Index' }),
      new MouseEvent('auxclick', { bubbles: true, button: 1 }),
    );
    expect(actions.onOpenInNewTab).toHaveBeenCalledTimes(2);
  });

  it('shows the menu it is given for the row right-clicked, and renames in place from it', async () => {
    const user = userEvent.setup();
    const actions = renderTree();
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: 'Index' }),
    });
    await user.click(await screen.findByRole('menuitem', { name: 'Act on Index' }));
    expect(actions.onMenu).toHaveBeenCalledWith(expect.objectContaining({ path: 'Index.md' }));

    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('treeitem', { name: 'Index' }),
    });
    await user.click(await screen.findByRole('menuitem', { name: 'Rename…' }));
    expect(await screen.findByRole('textbox', { name: 'New name' })).toHaveValue('Index');
  });
});
