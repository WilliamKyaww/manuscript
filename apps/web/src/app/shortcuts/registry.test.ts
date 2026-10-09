import { describe, expect, it, vi } from 'vitest';
import { eventToKeys, keyLabels, normaliseKeys, ShortcutRegistry } from './registry';

function keyEvent(init: KeyboardEventInit & { key: string }, target?: Element): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  if (target) Object.defineProperty(event, 'target', { value: target });
  return event;
}

describe('normaliseKeys', () => {
  it('orders modifiers canonically and lower-cases', () => {
    expect(normaliseKeys('Shift+Mod+F')).toBe('mod+shift+f');
    // Space is written by name and matches the space bar.
    expect(normaliseKeys('space')).toBe(
      eventToKeys(
        { key: ' ', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
        false,
      ),
    );
    expect(normaliseKeys('alt+MOD+k')).toBe('mod+alt+k');
    expect(normaliseKeys('Escape')).toBe('escape');
  });

  it('ignores Shift for symbols that already include it', () => {
    expect(normaliseKeys('?')).toBe('?');
    expect(normaliseKeys('shift+?')).toBe('?');
    expect(normaliseKeys('mod+\\')).toBe('mod+\\');
  });

  it('supports the plus key', () => {
    expect(normaliseKeys('mod++')).toBe('mod++');
  });
});

describe('eventToKeys', () => {
  it('maps Ctrl to mod on Windows and Meta to mod on Apple platforms', () => {
    expect(eventToKeys(keyEvent({ key: 'k', ctrlKey: true }), false)).toBe('mod+k');
    expect(eventToKeys(keyEvent({ key: 'k', metaKey: true }), true)).toBe('mod+k');
    expect(eventToKeys(keyEvent({ key: 'k', ctrlKey: true }), true)).toBe('ctrl+k');
  });

  it('treats shifted symbols and upper-case letters sensibly', () => {
    expect(eventToKeys(keyEvent({ key: '?', shiftKey: true }), false)).toBe('?');
    expect(eventToKeys(keyEvent({ key: 'F', shiftKey: true, ctrlKey: true }), false)).toBe(
      'mod+shift+f',
    );
  });
});

describe('keyLabels', () => {
  it('uses Windows names', () => {
    expect(keyLabels('mod+shift+f', false)).toEqual(['Ctrl', 'Shift', 'F']);
    expect(keyLabels('escape', false)).toEqual(['Esc']);
  });

  it('uses Apple symbols', () => {
    expect(keyLabels('mod+k', true)).toEqual(['⌘', 'K']);
  });
});

describe('ShortcutRegistry', () => {
  it('runs the matching handler and prevents the browser default', () => {
    const registry = new ShortcutRegistry();
    const handler = vi.fn();
    registry.register({
      id: 'palette',
      keys: 'mod+k',
      description: 'Palette',
      group: 'General',
      handler,
    });
    const event = keyEvent({ key: 'k', ctrlKey: true });
    expect(registry.handle(event, false)).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    expect(registry.handle(keyEvent({ key: 'j', ctrlKey: true }), false)).toBe(false);
  });

  it('ignores typing in inputs unless the shortcut allows it', () => {
    const registry = new ShortcutRegistry();
    const help = vi.fn();
    const palette = vi.fn();
    registry.register({
      id: 'help',
      keys: '?',
      description: 'Help',
      group: 'General',
      handler: help,
    });
    registry.register({
      id: 'palette',
      keys: 'mod+k',
      description: 'Palette',
      group: 'General',
      allowInInputs: true,
      handler: palette,
    });
    const input = document.createElement('input');
    expect(registry.handle(keyEvent({ key: '?', shiftKey: true }, input), false)).toBe(false);
    expect(help).not.toHaveBeenCalled();
    expect(registry.handle(keyEvent({ key: 'k', ctrlKey: true }, input), false)).toBe(true);
    expect(palette).toHaveBeenCalledOnce();
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    expect(registry.handle(keyEvent({ key: '?', shiftKey: true }, editor), false)).toBe(false);
  });

  it('prefers the most recently registered shortcut and supports removal', () => {
    const registry = new ShortcutRegistry();
    const global = vi.fn();
    const page = vi.fn();
    registry.register({
      id: 'global',
      keys: 'mod+s',
      description: 'Global',
      group: 'General',
      handler: global,
    });
    const unregister = registry.register({
      id: 'page',
      keys: 'mod+s',
      description: 'Page',
      group: 'Editor',
      handler: page,
    });
    registry.handle(keyEvent({ key: 's', ctrlKey: true }), false);
    expect(page).toHaveBeenCalledOnce();
    expect(registry.conflicts()).toEqual(['mod+s']);
    unregister();
    registry.handle(keyEvent({ key: 's', ctrlKey: true }), false);
    expect(global).toHaveBeenCalledOnce();
    expect(registry.conflicts()).toEqual([]);
  });

  it('skips repeated, composing and already-handled events', () => {
    const registry = new ShortcutRegistry();
    const handler = vi.fn();
    registry.register({ id: 'x', keys: 'mod+k', description: 'X', group: 'General', handler });
    expect(registry.handle(keyEvent({ key: 'k', ctrlKey: true, repeat: true }), false)).toBe(false);
    expect(registry.handle(keyEvent({ key: 'k', ctrlKey: true, isComposing: true }), false)).toBe(
      false,
    );
    const handled = keyEvent({ key: 'k', ctrlKey: true });
    handled.preventDefault();
    expect(registry.handle(handled, false)).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
