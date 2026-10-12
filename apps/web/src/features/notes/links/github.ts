/**
 * Links to GitHub, drawn as mentions (Phase 26): the mark and a short name read from the address
 * alone — a repository's name, `repo#12` for an issue or pull request, a file's name. Nothing is
 * fetched from GitHub, so a note never makes the application contact another site.
 */

export type GitHubKind =
  | 'user'
  | 'repository'
  | 'issue'
  | 'pull'
  | 'discussion'
  | 'file'
  | 'folder'
  | 'commit'
  | 'release'
  | 'gist'
  | 'other';

export interface GitHubLink {
  kind: GitHubKind;
  owner: string | null;
  repo: string | null;
  /** What the mention shows. */
  label: string;
  /** The longer name, for a tooltip: `owner/repo#12`. */
  title: string;
}

/** First segments that are GitHub's own pages, not a person or an organisation. */
const RESERVED = new Set([
  'about',
  'apps',
  'collections',
  'contact',
  'customer-stories',
  'enterprise',
  'events',
  'explore',
  'features',
  'issues',
  'join',
  'login',
  'marketplace',
  'new',
  'notifications',
  'pricing',
  'pulls',
  'search',
  'security',
  'settings',
  'site',
  'sponsors',
  'team',
  'topics',
  'trending',
]);

const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/u;

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export function parseGitHubUrl(href: string): GitHubLink | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean).map(decode);
  if (host === 'gist.github.com') {
    const [owner, id] = parts;
    if (!owner) return null;
    return id
      ? {
          kind: 'gist',
          owner,
          repo: null,
          label: `Gist ${id.slice(0, 7)}`,
          title: `Gist by ${owner}`,
        }
      : { kind: 'user', owner, repo: null, label: `${owner}’s gists`, title: `Gists by ${owner}` };
  }
  if (host !== 'github.com' && host !== 'www.github.com') return null;
  const [owner, repo, section, ...rest] = parts;
  if (!owner) return { kind: 'other', owner: null, repo: null, label: 'GitHub', title: 'GitHub' };
  if (RESERVED.has(owner.toLowerCase()) || !NAME.test(owner))
    return {
      kind: 'other',
      owner: null,
      repo: null,
      label: `GitHub ${parts.join('/')}`,
      title: url.pathname,
    };
  if (owner === 'orgs' && repo)
    return { kind: 'user', owner: repo, repo: null, label: repo, title: repo };
  if (!repo || !NAME.test(repo.replace(/\.git$/u, '')))
    return { kind: 'user', owner, repo: null, label: owner, title: owner };
  const name = repo.replace(/\.git$/u, '');
  const full = `${owner}/${name}`;
  const at = (kind: GitHubKind, label: string, title: string): GitHubLink => ({
    kind,
    owner,
    repo: name,
    label,
    title,
  });
  const number = rest[0] && /^\d+$/u.test(rest[0]) ? rest[0] : null;
  switch (section) {
    case undefined:
      return at('repository', name, full);
    case 'issues':
      return number
        ? at('issue', `${name}#${number}`, `${full}#${number}`)
        : at('other', `${name} issues`, `${full} issues`);
    case 'pull':
      return number
        ? at('pull', `${name}#${number}`, `${full}#${number}`)
        : at('other', name, full);
    case 'pulls':
      return at('other', `${name} pull requests`, `${full} pull requests`);
    case 'discussions':
      return number
        ? at('discussion', `${name}#${number}`, `${full}#${number}`)
        : at('other', `${name} discussions`, `${full} discussions`);
    case 'blob':
    case 'tree': {
      // /blob/<branch>/<path…>: the file or folder's own name, then the repository's.
      const path = rest.slice(1);
      const last = path.at(-1);
      if (!last)
        return at('folder', `${name} (${rest[0] ?? 'tree'})`, `${full} @ ${rest[0] ?? ''}`.trim());
      return at(
        section === 'blob' ? 'file' : 'folder',
        `${last} · ${name}`,
        `${full}/${path.join('/')}`,
      );
    }
    case 'commit': {
      const sha = rest[0] ?? '';
      return at('commit', `${name}@${sha.slice(0, 7)}`, `${full}@${sha}`);
    }
    case 'releases': {
      const tag = rest[0] === 'tag' ? rest[1] : null;
      return tag
        ? at('release', `${name} ${tag}`, `${full} ${tag}`)
        : at('other', `${name} releases`, `${full} releases`);
    }
    case 'wiki':
      return at('other', `${name} wiki`, `${full} wiki`);
    default:
      return at('other', name, `${full}/${[section, ...rest].join('/')}`);
  }
}

/**
 * What a link to GitHub shows: the words the note gave it, or — when the link is only its address
 * (a bare URL, `<url>`, or `[url](url)`) — the short name from the address.
 */
export function githubLabel(link: GitHubLink, text: string | null, url: string): string {
  const shown = text?.trim() ?? '';
  if (shown === '') return link.label;
  const bare = (value: string) =>
    value
      .replace(/^https?:\/\//iu, '')
      .replace(/^www\./iu, '')
      .replace(/\/$/u, '');
  return bare(shown) === bare(url) ? link.label : shown;
}
