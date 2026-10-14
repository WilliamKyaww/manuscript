import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEditorPrefs } from '../editor/editor-prefs';
import { createWorkspaceStore } from '../workspace/workspace-store';
import { displayUrl, externalUrl, openWebLink, wantsBrowser } from './external';
import { githubLabel, parseGitHubUrl } from './github';

/** Web links (Phase 26): what is a web address, where a click goes, and GitHub's names. */

afterEach(() => {
  delete window.skbDesktop;
  vi.restoreAllMocks();
});

describe('web addresses', () => {
  it('are http(s), or www. as https; never other schemes or credentials', () => {
    expect(externalUrl('https://www.sciencedirect.com/science/article/pii/S0168169921005408')).toBe(
      'https://www.sciencedirect.com/science/article/pii/S0168169921005408',
    );
    expect(externalUrl('www.example.org/a')).toBe('https://www.example.org/a');
    for (const refused of [
      'Note.md',
      '/api/files/x.pdf',
      'javascript:alert(1)',
      'file:///C:/x',
      'mailto:a@b.c',
      'https://user:pw@example.org',
      '',
      null,
    ])
      expect(externalUrl(refused)).toBeNull();
    expect(displayUrl('https://example.org/')).toBe('example.org');
  });

  it('go to the browser with Ctrl, ⌘, Shift or a middle click', () => {
    const none = { ctrlKey: false, metaKey: false, shiftKey: false, button: 0 };
    expect(wantsBrowser(none)).toBe(false);
    expect(wantsBrowser({ ...none, ctrlKey: true })).toBe(true);
    expect(wantsBrowser({ ...none, metaKey: true })).toBe(true);
    expect(wantsBrowser({ ...none, button: 1 })).toBe(true);
  });

  it('open in the browser here, and beside the note in the desktop app unless turned off', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    openWebLink('https://example.org/paper');
    expect(open).toHaveBeenCalledWith('https://example.org/paper', '_blank', 'noopener,noreferrer');

    // The desktop app's bridge: now a plain click opens a web tab in the workspace.
    window.skbDesktop = { web: {} } as unknown as NonNullable<typeof window.skbDesktop>;
    const { useWorkspace } = await import('../workspace/workspace-store');
    openWebLink('https://example.org/paper');
    expect(useWorkspace.getState().panes[1]?.tabs[0]?.url).toBe('https://example.org/paper');
    expect(open).toHaveBeenCalledTimes(1);
    openWebLink('https://example.org/other', { browser: true });
    expect(open).toHaveBeenCalledTimes(2);
    useEditorPrefs.getState().set('openLinksBeside', false);
    openWebLink('https://example.org/third');
    expect(open).toHaveBeenCalledTimes(3);
    useEditorPrefs.getState().set('openLinksBeside', true);
  });
});

describe('web pages in the workspace', () => {
  it('open on the right of the note, which stays the active pane', () => {
    localStorage.clear();
    const store = createWorkspaceStore({ persist: true });
    store.getState().show('note-a');
    const notePane = store.getState().activePane;
    store.getState().openWebPage('https://example.org/a');
    const [left, right] = store.getState().panes;
    expect(right?.tabs.map((tab) => tab.url)).toEqual(['https://example.org/a']);
    expect(left?.id).toBe(notePane);
    expect(store.getState().activePane).toBe(notePane);
    // Another link opens another tab there; the same link shows its tab again.
    store.getState().openWebPage('https://example.org/b');
    store.getState().openWebPage('https://example.org/a');
    const web = store.getState().panes[1];
    expect(web?.tabs.map((tab) => tab.url)).toEqual([
      'https://example.org/a',
      'https://example.org/b',
    ]);
    expect(web?.activeTab).toBe(web?.tabs[0]?.id);
  });

  it('keep the page when a note is shown in their pane, and remember where the page went', () => {
    localStorage.clear();
    const store = createWorkspaceStore({ persist: true });
    store.getState().show('note-a');
    store.getState().openWebPage('https://example.org/a');
    const web = store.getState().panes[1];
    if (!web) throw new Error('no web pane');
    store.getState().activateTab(web.id, web.activeTab);
    store.getState().show('note-b');
    const tabs = store.getState().panes[1]?.tabs ?? [];
    expect(tabs.map((tab) => tab.url ?? tab.noteId)).toEqual(['https://example.org/a', 'note-b']);
    store.getState().setTabUrl(web.activeTab, 'https://example.org/a#section');
    const again = createWorkspaceStore({ persist: true });
    expect(again.getState().panes[1]?.tabs[0]?.url).toBe('https://example.org/a#section');
  });
});

describe('GitHub links', () => {
  it('are named from the address alone', () => {
    const name = (url: string) => parseGitHubUrl(url)?.label;
    expect(name('https://github.com/WilliamKyaww/plant-disease-detection')).toBe(
      'plant-disease-detection',
    );
    expect(name('https://github.com/owner/repo.git')).toBe('repo');
    expect(name('https://github.com/owner/repo/issues/12')).toBe('repo#12');
    expect(name('https://github.com/owner/repo/pull/7')).toBe('repo#7');
    expect(name('https://github.com/owner/repo/blob/main/src/train.py')).toBe('train.py · repo');
    expect(name('https://github.com/owner/repo/tree/main/docs')).toBe('docs · repo');
    expect(name('https://github.com/owner/repo/commit/abcdef1234567')).toBe('repo@abcdef1');
    expect(name('https://github.com/owner/repo/releases/tag/v1.2.0')).toBe('repo v1.2.0');
    expect(name('https://github.com/owner')).toBe('owner');
    expect(name('https://github.com/features/actions')).toBe('GitHub features/actions');
    expect(name('https://gist.github.com/owner/0123456789abcdef')).toBe('Gist 0123456');
    expect(parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull();
    expect(parseGitHubUrl('https://raft.github.io/')).toBeNull();
  });

  it('keep the words a note gave them, unless the words are the address', () => {
    const url = 'https://github.com/owner/repo';
    const link = parseGitHubUrl(url);
    if (!link) throw new Error('not parsed');
    expect(githubLabel(link, 'our code', url)).toBe('our code');
    expect(githubLabel(link, 'github.com/owner/repo', url)).toBe('repo');
    expect(githubLabel(link, url, url)).toBe('repo');
    expect(githubLabel(link, null, url)).toBe('repo');
  });
});
