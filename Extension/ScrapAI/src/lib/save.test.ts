import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, deleteScrap, listFragments } from './db';
import type { ExtractResult } from './extract-page';
import { saveFromPage, type Extractor } from './save';

const settings = { articleMaxChars: 3000 as number | null };
const tab = { url: 'https://example.com/post?utm_source=x', title: '記事タイトル' };

function ex(partial: Partial<ExtractResult> = {}): ExtractResult {
  return {
    url: tab.url,
    title: tab.title,
    ogTitle: '',
    siteName: 'Example',
    description: '',
    ogImage: '',
    faviconUrl: '',
    selection: '',
    articleTitle: '',
    articleText: '',
    lang: '',
    ...partial,
  };
}
const returns = (r: ExtractResult): Extractor => async () => r;
const throws: Extractor = async () => {
  throw new Error('cannot inject');
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('saveFromPage: 新規保存', () => {
  it('本文・概要・選択テキストを断片として保存する', async () => {
    const out = await saveFromPage(
      tab,
      returns(ex({ articleText: '本文です。', description: 'OG概要', selection: '選択' })),
      settings,
    );
    expect(out.kind).toBe('created');
    expect(out.extractStatus).toBe('ok');
    const frags = await listFragments(out.scrapId!);
    expect(frags.map((f) => f.source)).toEqual(['selection', 'readability', 'meta']);
    const scrap = await db.scraps.get(out.scrapId!);
    expect(scrap?.normalizedUrl).toBe('https://example.com/post');
    expect(scrap?.url).toBe(tab.url); // 元のURLは書き換えない
    expect(scrap?.excerpt).toBe('選択');
    expect(scrap?.stars).toBeNull();
    expect(scrap?.aiAnswerCount).toBe(0);
  });

  it('抽出が失敗してもURLとタイトルは残り、状態は failed になる', async () => {
    const out = await saveFromPage(tab, throws, settings);
    expect(out.kind).toBe('created');
    expect(out.extractStatus).toBe('failed');
    const scrap = await db.scraps.get(out.scrapId!);
    expect(scrap?.title).toBe('記事タイトル');
    expect(scrap?.url).toBe(tab.url);
    expect(await listFragments(out.scrapId!)).toHaveLength(0);
  });

  it('概要しか取れなければ partial', async () => {
    const out = await saveFromPage(tab, returns(ex({ description: '概要だけ' })), settings);
    expect(out.extractStatus).toBe('partial');
  });

  it('本文を設定の文字数上限で切り詰める', async () => {
    const out = await saveFromPage(
      tab,
      returns(ex({ articleText: 'あ'.repeat(500) })),
      { articleMaxChars: 300 },
    );
    const [frag] = await listFragments(out.scrapId!);
    expect(frag?.text).toHaveLength(300);
    expect(frag?.truncated).toBe(true);
  });

  it('URLが無ければ failed', async () => {
    const out = await saveFromPage({ url: '', title: '' }, throws, settings);
    expect(out.kind).toBe('failed');
  });
});

describe('saveFromPage: 同一URL', () => {
  it('選択なしで再度保存すると何も変更せず already-saved', async () => {
    const first = await saveFromPage(tab, returns(ex({ articleText: '本文' })), settings);
    const out = await saveFromPage(tab, returns(ex({ articleText: '本文' })), settings);
    expect(out.kind).toBe('already-saved');
    expect(out.scrapId).toBe(first.scrapId);
    expect(await db.scraps.count()).toBe(1);
    expect(await listFragments(first.scrapId!)).toHaveLength(1);
  });

  it('追跡パラメータ違いのURLも同一とみなす', async () => {
    await saveFromPage(tab, returns(ex({ articleText: '本文' })), settings);
    const out = await saveFromPage(
      { url: 'https://example.com/post#top', title: 't' },
      returns(ex()),
      settings,
    );
    expect(out.kind).toBe('already-saved');
  });

  it('範囲選択があれば既存の項目に断片を追加し、同じ内容は重複させない', async () => {
    const first = await saveFromPage(tab, returns(ex({ articleText: '本文' })), settings);
    const added = await saveFromPage(tab, returns(ex({ selection: 'レスA' })), settings);
    expect(added.kind).toBe('fragment-added');
    expect(added.scrapId).toBe(first.scrapId);
    expect(added.fragmentCount).toBe(2);

    const dup = await saveFromPage(tab, returns(ex({ selection: 'レスA' })), settings);
    expect(dup.kind).toBe('duplicate-fragment');
    expect(await listFragments(first.scrapId!)).toHaveLength(2);

    const more = await saveFromPage(tab, returns(ex({ selection: 'レスB' })), settings);
    expect(more.kind).toBe('fragment-added');
    const frags = await listFragments(first.scrapId!);
    expect(frags.map((f) => f.order)).toEqual([0, 1, 2]);
    expect(await db.scraps.count()).toBe(1);
  });

  it('アーカイブ済みの項目は断片追加時に復元される', async () => {
    const first = await saveFromPage(tab, returns(ex({ articleText: '本文' })), settings);
    await db.scraps.update(first.scrapId!, { archivedAt: 123 });
    await saveFromPage(tab, returns(ex({ selection: '追加' })), settings);
    expect((await db.scraps.get(first.scrapId!))?.archivedAt).toBeNull();
  });

  it('再抽出モードでは本文の変化を断片として追加する', async () => {
    const first = await saveFromPage(tab, returns(ex({ articleText: '古い本文' })), settings);
    const out = await saveFromPage(tab, returns(ex({ articleText: '新しい本文' })), settings, 'reextract');
    expect(out.kind).toBe('fragment-added');
    expect(await listFragments(first.scrapId!)).toHaveLength(2);
  });

  it('別の項目として保存できる', async () => {
    await saveFromPage(tab, returns(ex({ articleText: '本文' })), settings);
    const out = await saveFromPage(tab, returns(ex({ articleText: '本文' })), settings, 'separate');
    expect(out.kind).toBe('created');
    expect(await db.scraps.count()).toBe(2);
  });
});

describe('deleteScrap', () => {
  it('配下の断片ごと削除する', async () => {
    const out = await saveFromPage(tab, returns(ex({ articleText: '本文' })), settings);
    await deleteScrap(out.scrapId!);
    expect(await db.scraps.count()).toBe(0);
    expect(await db.fragments.count()).toBe(0);
  });
});
