import { beforeEach, describe, expect, it } from 'vitest';
import {
  createWorkspaceStore,
  readLayout,
  selectActiveNoteId,
  type WorkspaceLayout,
} from './workspace-store';

const paper = 'https://example.org/paper';
const notes = {
  id: 'notes',
  tabs: [{ id: 'note-tab', noteId: 'note-a' }],
  activeTab: 'note-tab',
};
const web = {
  id: 'web',
  tabs: [{ id: 'web-tab', noteId: null, url: paper }],
  activeTab: 'web-tab',
};

beforeEach(() => localStorage.clear());

describe('web pages on the right', () => {
  it.each(['right', 'down'] as const)(
    'repairs an old pure browser/notes %s split without replacing tabs or focus',
    (direction) => {
      const previous: WorkspaceLayout = { panes: [web, notes], direction, activePane: web.id };
      const restored = readLayout(JSON.stringify(previous));
      expect(restored).toEqual({ panes: [notes, web], direction: 'right', activePane: web.id });
      localStorage.setItem('skb.notes.workspace', JSON.stringify(previous));
      const store = createWorkspaceStore({ persist: true });
      store.getState().openWebPage(paper, notes.id);
      expect(store.getState().panes).toEqual([notes, web]);
      expect(selectActiveNoteId(store.getState())).toBe('note-a');
    },
  );

  it('leaves mixed panes and two-note layouts in their chosen order until a link is opened', () => {
    const mixed = { ...web, tabs: [...web.tabs, { id: 'other-note', noteId: 'note-b' }] };
    for (const first of [mixed, { ...web, tabs: [{ id: 'web-tab', noteId: 'note-b' }] }]) {
      const layout = { panes: [first, notes], direction: 'down', activePane: notes.id };
      expect(readLayout(JSON.stringify(layout))).toEqual(layout);
    }
  });

  it.each([0, 1])(
    "opens from note pane %i on the left and keeps both panes' note tabs",
    (index) => {
      const store = createWorkspaceStore({ persist: true });
      store.getState().show('note-a');
      store.getState().openInOtherPane('note-b', 'down');
      const source = store.getState().panes[index];
      const other = store.getState().panes[1 - index];
      if (!source || !other) throw new Error('Missing pane');
      store.getState().openWebPage(paper, source.id);
      expect(store.getState().direction).toBe('right');
      expect(store.getState().panes[0]).toEqual(source);
      expect(store.getState().activePane).toBe(source.id);
      expect(store.getState().panes[1]?.id).toBe(other.id);
      expect(store.getState().panes[1]?.tabs[0]).toEqual(other.tabs[0]);
      expect(store.getState().panes[1]?.tabs[1]?.url).toBe(paper);
      store.getState().openWebPage(paper, source.id);
      expect(store.getState().panes[1]?.tabs).toHaveLength(2);
    },
  );

  it('keeps the note on the left through navigation, closing and reopening the browser', () => {
    const store = createWorkspaceStore({ persist: true });
    store.getState().show('note-a');
    const original = store.getState().panes[0];
    store.getState().openWebPage(paper);
    store.getState().show('note-b');
    const browser = store.getState().panes[1];
    if (!browser) throw new Error('Missing browser pane');
    store.getState().closeTab(browser.id, browser.activeTab);
    expect(store.getState().panes).toHaveLength(1);
    expect(store.getState().panes[0]?.id).toBe(original?.id);
    expect(selectActiveNoteId(store.getState())).toBe('note-b');
    store.getState().openWebPage(paper);
    expect(store.getState().panes[0]?.id).toBe(original?.id);
    expect(store.getState().panes[1]?.tabs[0]?.url).toBe(paper);
    const again = createWorkspaceStore({ persist: true });
    expect(again.getState().panes).toEqual(store.getState().panes);
  });
});
