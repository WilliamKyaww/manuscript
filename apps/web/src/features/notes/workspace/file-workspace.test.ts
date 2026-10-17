import { expect, it } from 'vitest';
import { activePaneOf, activeTabOf, createWorkspaceStore, readLayout } from './workspace-store';

it('opens files in persistent tabs without replacing notes or duplicating the same file', () => {
  const store = createWorkspaceStore({ persist: false });
  store.getState().show('note-a');
  store.getState().openFile('Data/results.csv');
  store.getState().openFile('Data/results.csv');
  expect(activePaneOf(store.getState()).tabs).toHaveLength(2);
  const saved = readLayout(JSON.stringify(store.getState()));
  expect(activeTabOf(activePaneOf(saved)).filePath).toBe('Data/results.csv');
  store.getState().show('note-b');
  expect(activePaneOf(store.getState()).tabs).toHaveLength(3);
  store.getState().prune(new Set(['note-a', 'note-b']));
  expect(activePaneOf(store.getState()).tabs.some((tab) => tab.filePath)).toBe(true);
});
