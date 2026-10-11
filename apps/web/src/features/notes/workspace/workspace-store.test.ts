import { beforeEach, describe, expect, it } from 'vitest';
import {
  activePaneOf,
  activeTabOf,
  createWorkspaceStore,
  readLayout,
  selectActiveNoteId,
} from './workspace-store';

/** Tabs and panes (task 23.04): what each action does to the layout. */

let store: ReturnType<typeof createWorkspaceStore>;
const state = () => store.getState();
const tabs = (index = 0) => state().panes[index]?.tabs.map((tab) => tab.noteId);
const active = () => selectActiveNoteId(state());

beforeEach(() => {
  localStorage.clear();
  store = createWorkspaceStore({ persist: true });
});

describe('the workspace', () => {
  it('starts with one pane and one empty tab', () => {
    expect(state().panes).toHaveLength(1);
    expect(tabs()).toEqual([null]);
    expect(active()).toBeNull();
  });

  it('shows a note in the active tab, or switches to the tab that already has it', () => {
    state().show('a');
    expect(tabs()).toEqual(['a']);
    state().openInNewTab('b');
    expect(tabs()).toEqual(['a', 'b']);
    expect(active()).toBe('b');
    state().show('a');
    expect(tabs()).toEqual(['a', 'b']);
    expect(active()).toBe('a');
    state().show('c');
    expect(tabs()).toEqual(['c', 'b']);
  });

  it('opens new tabs after the active one, in the background when asked', () => {
    state().show('a');
    state().openInNewTab('b');
    state().activateTab(state().panes[0]?.id ?? '', state().panes[0]?.tabs[0]?.id ?? '');
    state().openInNewTab('c', { background: true });
    expect(tabs()).toEqual(['a', 'c', 'b']);
    expect(active()).toBe('a');
  });

  it('closes tabs: the neighbour takes over, and the last leaves an empty tab', () => {
    state().show('a');
    state().openInNewTab('b');
    state().openInNewTab('c');
    const pane = activePaneOf(state());
    state().closeTab(pane.id, activeTabOf(pane).id);
    expect(tabs()).toEqual(['a', 'b']);
    expect(active()).toBe('b');
    const [first] = activePaneOf(state()).tabs;
    state().closeOtherTabs(pane.id, first?.id ?? '');
    expect(tabs()).toEqual(['a']);
    state().closeTab(pane.id, first?.id ?? '');
    expect(tabs()).toEqual([null]);
  });

  it('splits into a second pane, reuses it, and closes it with its last tab', () => {
    state().show('a');
    state().openInOtherPane('b', 'down');
    expect(state().panes).toHaveLength(2);
    expect(state().direction).toBe('down');
    expect(tabs(1)).toEqual(['b']);
    expect(active()).toBe('b');

    state().focusPane(state().panes[0]?.id ?? '');
    expect(active()).toBe('a');
    state().openInOtherPane('c', 'right');
    expect(tabs(1)).toEqual(['b', 'c']);
    // From the first pane again, a note the second already has is shown there, not opened twice.
    state().focusPane(state().panes[0]?.id ?? '');
    state().openInOtherPane('b', 'right');
    expect(tabs(1)).toEqual(['b', 'c']);
    expect(active()).toBe('b');

    const second = state().panes[1];
    for (const tab of second?.tabs ?? []) state().closeTab(second?.id ?? '', tab.id);
    expect(state().panes).toHaveLength(1);
    expect(active()).toBe('a');
  });

  it('moves tabs, and replaces or closes the tabs of a note that changed', () => {
    state().show('a');
    state().openInNewTab('b');
    state().openInNewTab('c');
    const pane = activePaneOf(state());
    state().moveTab(pane.id, pane.tabs[2]?.id ?? '', 0);
    expect(tabs()).toEqual(['c', 'a', 'b']);
    state().replaceNote('a', 'z');
    expect(tabs()).toEqual(['c', 'z', 'b']);
    state().closeNotes(new Set(['z', 'b']));
    expect(tabs()).toEqual(['c']);
    state().prune(new Set());
    expect(tabs()).toEqual([null]);
  });

  it('is remembered, and a damaged memory gives a fresh workspace', () => {
    state().show('a');
    state().openInOtherPane('b', 'right');
    const again = createWorkspaceStore({ persist: true });
    expect(again.getState().panes.map((pane) => pane.tabs.map((tab) => tab.noteId))).toEqual([
      ['a'],
      ['b'],
    ]);
    expect(selectActiveNoteId(again.getState())).toBe('b');

    expect(readLayout('{not json').panes).toHaveLength(1);
    expect(
      readLayout(JSON.stringify({ panes: [], direction: 'right', activePane: 'x' })).panes,
    ).toHaveLength(1);
    // A remembered active tab or pane that is not there is repaired, not trusted.
    const repaired = readLayout(
      JSON.stringify({
        panes: [{ id: 'p', tabs: [{ id: 't', noteId: 'a' }], activeTab: 'gone' }],
        direction: 'right',
        activePane: 'gone',
      }),
    );
    expect(selectActiveNoteId(repaired)).toBe('a');
  });

  it('is not remembered in a pop-out window', () => {
    const popout = createWorkspaceStore({ persist: false });
    popout.getState().show('a');
    expect(localStorage.getItem('skb.notes.workspace')).toBeNull();
  });
});
