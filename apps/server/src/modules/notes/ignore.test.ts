import { describe, expect, it } from 'vitest';
import { compileIgnorePattern, createClassifier } from './ignore';

describe('compileIgnorePattern', () => {
  it('matches names at any depth unless anchored', () => {
    const drafts = compileIgnorePattern('drafts');
    expect(drafts('drafts', true)).toBe(true);
    expect(drafts('Modules/drafts/Note.md', false)).toBe(true);
    expect(drafts('Modules/drafts-old/Note.md', false)).toBe(false);

    const anchored = compileIgnorePattern('/Archive');
    expect(anchored('Archive/2024/Note.md', false)).toBe(true);
    expect(anchored('Modules/Archive/Note.md', false)).toBe(false);

    const inner = compileIgnorePattern('Modules/Old');
    expect(inner('Modules/Old/Note.md', false)).toBe(true);
    expect(inner('Other/Modules/Old/Note.md', false)).toBe(false);
  });

  it('supports wildcards, case-insensitively', () => {
    const excalidraw = compileIgnorePattern('*.excalidraw.md');
    expect(excalidraw('Drawings/Plan.Excalidraw.md', false)).toBe(true);
    expect(excalidraw('Plan.md', false)).toBe(false);

    const deep = compileIgnorePattern('**/tmp/**');
    expect(deep('tmp/a.md', false)).toBe(true);
    expect(deep('a/b/tmp/c/d.md', false)).toBe(true);

    const single = compileIgnorePattern('Week ?/Scratch*');
    expect(single('Week 1/Scratchpad.md', false)).toBe(true);
    expect(single('Week 10/Scratchpad.md', false)).toBe(false);
  });

  it('applies folder-only patterns to folders and their contents only', () => {
    const folderOnly = compileIgnorePattern('build/');
    expect(folderOnly('build', true)).toBe(true);
    expect(folderOnly('build/out.md', false)).toBe(true);
    expect(folderOnly('build', false)).toBe(false);
  });

  it('treats blank patterns as matching nothing', () => {
    expect(compileIgnorePattern('  / ')('anything.md', false)).toBe(false);
  });
});

describe('createClassifier', () => {
  const classifier = createClassifier(['Archive/']);

  it('classifies notes, attachments and ignored files', () => {
    expect(classifier.classifyFile('Notes/Paxos.md')).toBe('note');
    expect(classifier.classifyFile('Notes/Paxos.MD')).toBe('note');
    expect(classifier.classifyFile('Attachments/a.png')).toBe('attachment');
    expect(classifier.classifyFile('Sources/COC251/Slides.md')).toBe('attachment');
    expect(classifier.classifyFile('Archive/Old.md')).toBe('ignored');
    expect(classifier.classifyFile('.obsidian/app.json')).toBe('ignored');
    expect(classifier.classifyFile('.skb/skb.db')).toBe('ignored');
    expect(classifier.classifyFile('Notes/.DS_Store')).toBe('ignored');
    expect(classifier.classifyFile('node_modules/x/readme.md')).toBe('ignored');
    expect(classifier.classifyFile('Notes/.Paxos.md.123.0a1b2c3d.tmp')).toBe('ignored');
  });

  it('ignores hidden and tool folders', () => {
    expect(classifier.isIgnoredFolder('.git')).toBe(true);
    expect(classifier.isIgnoredFolder('Notes/.trash')).toBe(true);
    expect(classifier.isIgnoredFolder('Archive')).toBe(true);
    expect(classifier.isIgnoredFolder('Notes')).toBe(false);
  });
});
