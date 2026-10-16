import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  archiveScraps,
  createCategory,
  db,
  deleteCategory,
  deleteFragments,
  deleteScraps,
  listFragments,
  moveCategory,
  renameCategory,
  restoreScraps,
  setCategoryOn,
  splitFragment,
} from './db';
import type { ExtractResult } from './extract-page';
import { saveFromPage } from './save';

const settings = { articleMaxChars: 3000 as number | null };
const tab = { url: 'https://example.com/thread', title: 'スレ' };
const ex = (p: Partial<ExtractResult>): ExtractResult => ({
  url: tab.url, title: tab.title, ogTitle: '', siteName: '', description: '', ogImage: '',
  faviconUrl: '', selection: '', articleTitle: '', articleText: '', lang: '', ...p,
});

async function seed(selection: string, articleText = '') {
  return saveFromPage(tab, async () => ex({ selection, articleText }), settings);
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('アーカイブ', () => {
  it('アーカイブ→復元ができ、データは消えない', async () => {
    const { scrapId } = await seed('レス1');
    await archiveScraps([scrapId!]);
    expect((await db.scraps.get(scrapId!))?.archivedAt).not.toBeNull();
    expect(await listFragments(scrapId!)).toHaveLength(1);
    await restoreScraps([scrapId!]);
    expect((await db.scraps.get(scrapId!))?.archivedAt).toBeNull();
  });

  it('完全削除は配下の断片ごと消す', async () => {
    const { scrapId } = await seed('レス1');
    await deleteScraps([scrapId!]);
    expect(await db.scraps.count()).toBe(0);
    expect(await db.fragments.count()).toBe(0);
  });
});

describe('カテゴリ', () => {
  it('作成（同名は作らない）・名前変更・並べ替え', async () => {
    const a = await createCategory('AI');
    const b = await createCategory('レシピ');
    expect((await createCategory('AI')).id).toBe(a.id);
    expect(await db.categories.count()).toBe(2);

    await renameCategory(b.id, '料理');
    expect((await db.categories.get(b.id))?.name).toBe('料理');

    await moveCategory(b.id, -1);
    const sorted = (await db.categories.toArray()).sort((x, y) => x.order - y.order);
    expect(sorted.map((c) => c.name)).toEqual(['料理', 'AI']);
    await moveCategory(b.id, -1); // 先頭からさらに上へは動かない
    expect((await db.categories.toArray()).sort((x, y) => x.order - y.order)[0]?.name).toBe('料理');
  });

  it('複数カテゴリの付与・解除', async () => {
    const { scrapId } = await seed('レス1');
    const a = await createCategory('A');
    const b = await createCategory('B');
    await setCategoryOn([scrapId!], a.id, true);
    await setCategoryOn([scrapId!], b.id, true);
    await setCategoryOn([scrapId!], a.id, true); // 二重に付かない
    expect((await db.scraps.get(scrapId!))?.categoryIds).toEqual([a.id, b.id]);
    await setCategoryOn([scrapId!], a.id, false);
    expect((await db.scraps.get(scrapId!))?.categoryIds).toEqual([b.id]);
  });

  it('カテゴリを削除しても項目は残り、そのカテゴリだけ外れる', async () => {
    const { scrapId } = await seed('レス1');
    const a = await createCategory('A');
    const b = await createCategory('B');
    await setCategoryOn([scrapId!], a.id, true);
    await setCategoryOn([scrapId!], b.id, true);
    await deleteCategory(a.id);
    expect(await db.scraps.count()).toBe(1);
    expect((await db.scraps.get(scrapId!))?.categoryIds).toEqual([b.id]);
  });
});

describe('断片の削除と切り出し', () => {
  it('断片を削除すると概要が作り直される', async () => {
    const { scrapId } = await seed('レス1', '本文');
    await saveFromPage(tab, async () => ex({ selection: 'レス2' }), settings);
    const frags = await listFragments(scrapId!);
    expect(frags).toHaveLength(3);
    const sel1 = frags.find((f) => f.text === 'レス1')!;
    expect((await db.scraps.get(scrapId!))?.excerpt).toBe('レス1');
    await deleteFragments([sel1.id]);
    expect(await listFragments(scrapId!)).toHaveLength(2);
    expect((await db.scraps.get(scrapId!))?.excerpt).toBe('レス2');
  });

  it('断片を別の項目に切り出せる（評価・カテゴリ・メモは空から）', async () => {
    const { scrapId } = await seed('レス1');
    await saveFromPage(tab, async () => ex({ selection: 'レス2' }), settings);
    await db.scraps.update(scrapId!, { stars: 5, pinned: true, memo: '元メモ', categoryIds: ['c'] });
    const frag2 = (await listFragments(scrapId!)).find((f) => f.text === 'レス2')!;

    const newId = await splitFragment(frag2.id);
    expect(newId).toBeTruthy();
    const created = await db.scraps.get(newId!);
    expect(created?.url).toBe(tab.url);
    expect(created?.title).toBe('スレ');
    expect(created?.stars).toBeNull();
    expect(created?.pinned).toBe(false);
    expect(created?.memo).toBe('');
    expect(created?.categoryIds).toEqual([]);
    expect(created?.excerpt).toBe('レス2');

    expect((await listFragments(newId!)).map((f) => f.text)).toEqual(['レス2']);
    const orig = await db.scraps.get(scrapId!);
    expect((await listFragments(scrapId!)).map((f) => f.text)).toEqual(['レス1']);
    expect(orig?.stars).toBe(5); // 元の項目は変わらない
    expect(orig?.excerpt).toBe('レス1');
  });

  it('断片が1つだけの項目からは切り出せない', async () => {
    const { scrapId } = await seed('レス1');
    const [only] = await listFragments(scrapId!);
    expect(await splitFragment(only!.id)).toBeUndefined();
    expect(await db.scraps.count()).toBe(1);
  });
});

describe('保存の取り消し', () => {
  it('既存項目への断片追加は、追加した断片だけを取り消せる', async () => {
    const first = await seed('レス1', '本文');
    const added = await saveFromPage(tab, async () => ex({ selection: 'レス2' }), settings);
    expect(added.kind).toBe('fragment-added');
    expect(added.addedFragmentIds).toHaveLength(1);

    await deleteFragments(added.addedFragmentIds!);
    expect(await db.scraps.count()).toBe(1); // 項目は残る
    expect((await listFragments(first.scrapId!)).map((f) => f.text)).toEqual(['レス1', '本文']);
  });
});
