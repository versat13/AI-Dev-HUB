// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractFromDocument } from './extract-page';

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

const win = { getSelection: () => ({ toString: () => '  選んだ文章 ' }) } as unknown as Window;
const emptyWin = { getSelection: () => null } as unknown as Window;

describe('extractFromDocument', () => {
  it('OGP・説明・選択テキストを取得する', () => {
    const doc = makeDoc(`
      <html lang="ja"><head><title>タイトル</title>
      <meta property="og:title" content="OGタイトル">
      <meta property="og:site_name" content="サイト名">
      <meta property="og:description" content="OG概要">
      <meta property="og:image" content="https://example.com/a.png">
      </head><body><p>短い</p></body></html>`);
    const r = extractFromDocument(doc, win);
    expect(r.title).toBe('タイトル');
    expect(r.ogTitle).toBe('OGタイトル');
    expect(r.siteName).toBe('サイト名');
    expect(r.description).toBe('OG概要');
    expect(r.ogImage).toBe('https://example.com/a.png');
    expect(r.selection.trim()).toBe('選んだ文章'); // 空白の整形は保存側（normalizeText）で行う
    expect(r.lang).toBe('ja');
  });

  it('og:description が無ければ meta description を使う', () => {
    const doc = makeDoc('<html><head><meta name="description" content="通常の概要"></head><body></body></html>');
    expect(extractFromDocument(doc, emptyWin).description).toBe('通常の概要');
  });

  it('Readability で本文を抽出し、元の文書は変更しない', () => {
    const para = '本文の段落です。'.repeat(40);
    const doc = makeDoc(`
      <html><head><title>記事</title></head><body>
      <nav>メニュー</nav>
      <article><h1>見出し</h1><p>${para}</p><p>${para}</p><p>${para}</p></article>
      </body></html>`);
    const r = extractFromDocument(doc, emptyWin);
    expect(r.articleText).toContain('本文の段落です。');
    expect(doc.querySelector('nav')).not.toBeNull();
    expect(r.selection).toBe('');
  });

  it('本文が取れないページでも例外にならない', () => {
    const doc = makeDoc('<html><body></body></html>');
    const r = extractFromDocument(doc, emptyWin);
    expect(r.articleText).toBe('');
  });
});
