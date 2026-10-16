import { describe, expect, it } from 'vitest';
import { BUILTIN_PROFILES } from './builtin-profiles';
import { matchUrlPattern, pickProfile } from './profile-match';
import type { SiteProfile } from './types';

describe('matchUrlPattern', () => {
  it('ホスト完全一致・www は無視・クエリと#は無視', () => {
    expect(matchUrlPattern('example.com/a', 'https://www.example.com/a?x=1#h')).toBe(true);
    expect(matchUrlPattern('example.com/a', 'https://other.com/a')).toBe(false);
    expect(matchUrlPattern('example.com', 'https://example.com/')).toBe(true);
  });
  it('* は1階層、** は残り全部', () => {
    expect(matchUrlPattern('github.com/*/*', 'https://github.com/o/r')).toBe(true);
    expect(matchUrlPattern('github.com/*/*', 'https://github.com/o/r/')).toBe(true);
    expect(matchUrlPattern('github.com/*/*', 'https://github.com/o/r/issues/1')).toBe(false);
    expect(matchUrlPattern('github.com/*/*', 'https://github.com/o')).toBe(false);
    expect(matchUrlPattern('x.com/*/status/**', 'https://x.com/u/status/1/photo/1')).toBe(true);
    expect(matchUrlPattern('x.com/*/status/**', 'https://x.com/u/status/1')).toBe(true);
    expect(matchUrlPattern('x.com/*/status/**', 'https://x.com/u')).toBe(false);
  });
  it('*.host はサブドメインのみ', () => {
    expect(matchUrlPattern('*.2chan.net/*/res/*', 'https://img.2chan.net/b/res/1478296132.htm')).toBe(true);
    expect(matchUrlPattern('*.2chan.net/*/res/*', 'https://2chan.net/b/res/1.htm')).toBe(false);
    expect(matchUrlPattern('*.2chan.net/*/res/*', 'https://img.2chan.net/b/futaba.htm')).toBe(false);
  });
  it('http/https 以外と不正なURLは一致しない', () => {
    expect(matchUrlPattern('example.com/**', 'chrome://extensions')).toBe(false);
    expect(matchUrlPattern('example.com/**', 'not a url')).toBe(false);
  });
});

const stamp = (p: (typeof BUILTIN_PROFILES)[number]): SiteProfile => ({ ...p, createdAt: 1, updatedAt: 1 });

describe('pickProfile', () => {
  const profiles = BUILTIN_PROFILES.map(stamp);
  it('組み込みの対応表', () => {
    const id = (u: string) => pickProfile(profiles, u)?.id;
    expect(id('https://x.com/thedelost/status/2110472847084650726')).toBe('builtin-x');
    expect(id('https://twitter.com/a/status/1')).toBe('builtin-x');
    expect(id('https://github.com/anthropics/claude-code')).toBe('builtin-github-repo');
    expect(id('https://github.com/anthropics/claude-code/issues/12')).toBe('builtin-github-issue');
    expect(id('https://github.com/anthropics/claude-code/pull/3')).toBe('builtin-github-issue');
    expect(id('https://img.2chan.net/b/res/1478296132.htm')).toBeUndefined(); // v1.0.13 で組み込みから外した
    expect(id('https://example.com/post')).toBeUndefined();
    expect(id('https://x.com/home')).toBeUndefined();
  });
  it('無効なプロファイルは選ばれず、優先度の高いものが勝つ', () => {
    const base = profiles.find((p) => p.id === 'builtin-x')!;
    const mine: SiteProfile = { ...base, id: 'mine', builtIn: false, priority: 200 };
    expect(pickProfile([base, mine], 'https://x.com/u/status/1')?.id).toBe('mine');
    expect(pickProfile([base, { ...mine, enabled: false }], 'https://x.com/u/status/1')?.id).toBe('builtin-x');
  });
});

describe('組み込みプロファイル（v2で追加したサイト）', () => {
  const all = BUILTIN_PROFILES.map((p) => ({ ...p, createdAt: 1, updatedAt: 1 }));
  it.each([
    ['https://zenn.dev/someone/articles/abc123', 'builtin-zenn'],
    ['https://qiita.com/someone/items/0123abcd', 'builtin-qiita'],
    ['https://note.com/someone/n/n0123abcd', 'builtin-note'],
    ['https://foo.hatenablog.com/entry/2026/10/16/120000', 'builtin-hatenablog'],
    ['https://stackoverflow.com/questions/123/how-to-x', 'builtin-stackoverflow'],
    ['https://www.reddit.com/r/LocalLLaMA/comments/abc/title/', 'builtin-reddit'],
    ['https://news.ycombinator.com/item?id=1', 'builtin-hackernews'],
    ['https://bsky.app/profile/a.bsky.social/post/3k', 'builtin-bluesky'],
    ['https://www.youtube.com/watch?v=abc', 'builtin-youtube'],
    ['https://ja.wikipedia.org/wiki/拡張機能', 'builtin-wikipedia'],
    ['https://dev.to/someone/my-post-1abc', 'builtin-devto'],
    ['https://x.com/u/status/1', 'builtin-x'],
  ])('%s → %s', (url, id) => {
    expect(pickProfile(all, url)?.id).toBe(id);
  });
  it('一覧ページなどには当てない', () => {
    expect(pickProfile(all, 'https://zenn.dev/')).toBeUndefined();
    expect(pickProfile(all, 'https://qiita.com/someone')).toBeUndefined();
  });
});
