import { describe, expect, it } from 'vitest';
import { domainOf, normalizeUrl } from './url';

describe('normalizeUrl: 汎用', () => {
  it('# 以降と追跡パラメータを除去する', () => {
    expect(normalizeUrl('https://example.com/a?utm_source=x&id=3&fbclid=abc#top')).toBe(
      'https://example.com/a?id=3',
    );
  });

  it('ホスト名を小文字にし、末尾の / を除去する', () => {
    expect(normalizeUrl('https://Example.COM/foo/')).toBe('https://example.com/foo');
  });

  it('ルートの / は残す', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('http を https に揃える', () => {
    expect(normalizeUrl('http://example.com/a')).toBe('https://example.com/a');
  });

  it('クエリをキー順に並べる', () => {
    expect(normalizeUrl('https://example.com/?b=2&a=1')).toBe('https://example.com/?a=1&b=2');
  });

  it('URLとして解釈できない文字列はそのまま返す', () => {
    expect(normalizeUrl('  not a url ')).toBe('not a url');
  });

  it('http/https 以外のスキームは # だけ除去する', () => {
    expect(normalizeUrl('chrome://extensions/#x')).toBe('chrome://extensions/');
  });

  it('日本語のパス（ふたばのスレッドなど）をそのまま扱う', () => {
    expect(normalizeUrl('https://img.2chan.net/b/res/123456789.htm')).toBe(
      'https://img.2chan.net/b/res/123456789.htm',
    );
  });
});

describe('normalizeUrl: X', () => {
  it('twitter.com / mobile.x.com を x.com に統一する', () => {
    expect(normalizeUrl('https://twitter.com/user/status/123')).toBe('https://x.com/user/status/123');
    expect(normalizeUrl('https://mobile.x.com/user/status/123')).toBe('https://x.com/user/status/123');
  });

  it('クエリと /photo/1 などの末尾を除去する', () => {
    expect(normalizeUrl('https://x.com/user/status/123/photo/1?s=20&t=abc')).toBe(
      'https://x.com/user/status/123',
    );
  });

  it('/i/web/status/<id> 形式も扱う', () => {
    expect(normalizeUrl('https://x.com/i/web/status/999?s=1')).toBe('https://x.com/i/web/status/999');
  });

  it('投稿以外のページは追跡パラメータだけ除去する', () => {
    expect(normalizeUrl('https://twitter.com/home?utm_source=a')).toBe('https://x.com/home');
  });
});

describe('normalizeUrl: GitHub', () => {
  it('リポジトリ配下のページを owner/repo に寄せる', () => {
    expect(normalizeUrl('https://github.com/foo/bar/tree/main/src?tab=x#readme')).toBe(
      'https://github.com/foo/bar',
    );
    expect(normalizeUrl('https://github.com/foo/bar.git')).toBe('https://github.com/foo/bar');
  });

  it('issues / pull は個別のキーにする', () => {
    expect(normalizeUrl('https://github.com/foo/bar/issues/12#issuecomment-1')).toBe(
      'https://github.com/foo/bar/issues/12',
    );
    expect(normalizeUrl('https://github.com/foo/bar/pull/7/files')).toBe(
      'https://github.com/foo/bar/pull/7',
    );
  });

  it('issues の一覧はリポジトリのキーになる', () => {
    expect(normalizeUrl('https://github.com/foo/bar/issues')).toBe('https://github.com/foo/bar');
  });

  it('ユーザーページと予約パスはそのまま', () => {
    expect(normalizeUrl('https://github.com/foo')).toBe('https://github.com/foo');
    expect(normalizeUrl('https://github.com/orgs/foo/people')).toBe('https://github.com/orgs/foo/people');
  });
});

describe('domainOf', () => {
  it('www. を除く', () => {
    expect(domainOf('https://www.example.com/a')).toBe('example.com');
  });
  it('不正なURLは空文字', () => {
    expect(domainOf('???')).toBe('');
  });
});
