/**
 * A small Obsidian vault exercising the dialect (knowledge-system.md §2) and Obsidian's own files.
 * Defined in code rather than as files so that line endings, byte-order marks and odd bytes are
 * exactly as written (git would normalise them).
 */
export const OBSIDIAN_VAULT: Record<string, string | Uint8Array> = {
  '.obsidian/app.json': '{"alwaysUpdateLinks":true,"newLinkFormat":"shortest"}\n',
  '.obsidian/workspace.json': '{"main":{"id":"abc"}}\n',
  '.obsidian/plugins/dataview/data.json': '{}\n',
  '.trash/Old note.md': '# Deleted in Obsidian\n',

  'Home.md': [
    '---',
    '# a comment the app must keep',
    'aliases: [Start, Dashboard]',
    'tags:',
    '  - index',
    '  - cs/distributed',
    'cssclasses: wide',
    '---',
    '# Home',
    '',
    'Modules: [[COC251/Overview|Distributed systems]] and [[Consensus#Paxos]] and [[Consensus#^summary-block]].',
    'Shortcut by alias: [[Raft algorithm]]; case-insensitive: [[consensus]].',
    'Missing: [[Byzantine generals]]. Markdown link: [overview](COC251/Overview.md).',
    '',
    '![[diagram.png]]',
    '![[Consensus#Paxos]]',
    '',
    '> [!tip] Revision',
    '> Use #exam/week-3 and ==highlight== the key points.',
    '',
    '%% hidden comment with [[Not a link]] %%',
    '',
    '```js',
    'const notALink = "[[Nope]]"; // #not-a-tag',
    '```',
    '',
    '| Note | Link |',
    '|---|---|',
    '| CAP | [[CAP theorem\\|CAP]] |',
    '',
  ].join('\n'),

  'Consensus.md': [
    '---',
    'id: 202310041305',
    'created: 2023-10-04',
    '---',
    '# Consensus',
    '## Paxos',
    'Quorum: $q > \\frac{n}{2}$. A summary paragraph. ^summary-block',
    '## Raft',
    'See [[Raft]].',
    '',
  ].join('\n'),

  'COC251/Overview.md': '# COC251 overview\r\nLinks back to [[Home]] and [[Start]].\r\n',
  'COC251/Raft.md': '﻿---\naliases: Raft algorithm\n---\n# Raft\nLeader election.\n',
  'COC251/CAP theorem.md': '# CAP theorem\nConsistency, availability, partition tolerance.\n',
  'Inbox/Broken frontmatter.md': '---\ntitle: [unclosed\n---\nBody with [[Home]].\n',
  'Inbox/Latin-1.md': new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0a]),
  'Templates/Lecture.md': '---\ntype: lecture-notes\n---\n# {{title}}\nDate: {{date}}\n',
  'Drawings/Plan.canvas': '{"nodes":[],"edges":[]}\n',
  'Attachments/diagram.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'Empty folder/.gitkeep': '',
};

/**
 * How Obsidian (newLinkFormat: shortest) resolves the links in Home.md, by target as written.
 * `null` means unresolved.
 */
export const OBSIDIAN_RESOLUTION: Record<string, string | null> = {
  'COC251/Overview': 'COC251/Overview.md',
  Consensus: 'Consensus.md',
  'Raft algorithm': 'COC251/Raft.md',
  consensus: 'Consensus.md',
  'Byzantine generals': null,
  'COC251/Overview.md': 'COC251/Overview.md',
  'diagram.png': 'Attachments/diagram.png',
  'CAP theorem': 'COC251/CAP theorem.md',
};
