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
    expect(id('https://img.2chan.net/b/res/1478296132.htm')).toBe('builtin-futaba');
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
