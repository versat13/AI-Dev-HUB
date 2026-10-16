import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, deleteScraps, setFavicon, setPinnedOn, setStarsOn } from './db';
import type { ExtractResult } from './extract-page';
import { saveFromPage } from './save';
import { addSnapshot, deleteSnapshotsOf, listSnapshots } from './snapshot';
import { pageNumbers, pageSlice } from './paging';

const ex = (url: string, icon?: string): ExtractResult => ({
  url, title: 'T', ogTitle: '', siteName: '', description: '', ogImage: '', faviconUrl: '',
  selection: 'あいう', articleTitle: '', articleText: '', lang: '', faviconData: icon,
});
const st = { articleMaxChars: 1000 as number | null };
const save = async (url: string, icon?: string) => (await saveFromPage({ url, title: url }, async () => ex(url, icon), st)).scrapId!;

beforeEach(async () => {
  for (const t of db.tables) await t.clear();
});

describe('ドメインのアイコン', () => {
  it('保存時に取り、そのドメインの項目が無くなったら消す', async () => {
    const a = await save('https://a.example/1', 'data:image/png;base64,AAAA');
    const b = await save('https://a.example/2');
    await save('https://b.example/1', 'data:image/png;base64,BBBB');
    expect((await db.favicons.toArray()).map((f) => f.domain).sort()).toEqual(['a.example', 'b.example']);
    await deleteScraps([a]);
    expect(await db.favicons.get('a.example')).toBeTruthy(); // まだ a.example の項目が残っている
    await deleteScraps([b]);
    expect(await db.favicons.get('a.example')).toBeUndefined();
    expect(await db.favicons.get('b.example')).toBeTruthy();
  });

  it('アイコンが取れなかったときは何も保存しない', async () => {
    await setFavicon('x.example', undefined);
    expect(await db.favicons.count()).toBe(0);
  });
});

describe('まとめて操作', () => {
  it('星とピン留めをまとめて付け外しする', async () => {
    const ids = [await save('https://a.example/1'), await save('https://a.example/2')];
    await setStarsOn(ids, 4);
    await setPinnedOn(ids, true);
    expect((await db.scraps.bulkGet(ids)).every((s) => s!.stars === 4 && s!.pinned)).toBe(true);
    await setStarsOn(ids, null);
    await setPinnedOn(ids, false);
    expect((await db.scraps.bulkGet(ids)).every((s) => s!.stars === null && !s!.pinned)).toBe(true);
  });

  it('スナップショットだけをまとめて消し、項目は残す。消した記録を残す', async () => {
    const id = await save('https://a.example/1');
    const keep = await save('https://a.example/2');
    const img = { blob: new Blob(['x']), width: 1, height: 1 };
    const s1 = await addSnapshot(id, img);
    await addSnapshot(keep, img);
    await deleteSnapshotsOf([id]);
    expect(await listSnapshots(id)).toHaveLength(0);
    expect(await listSnapshots(keep)).toHaveLength(1);
    expect(await db.scraps.get(id)).toBeTruthy();
    expect(await db.tombstones.get(s1.id)).toBeTruthy();
  });
});

describe('ページ送り', () => {
  it('1ページ分を切り出し、範囲外のページは丸める', () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    expect(pageSlice(items, 1, 50).items).toHaveLength(50);
    expect(pageSlice(items, 3, 50)).toMatchObject({ page: 3, pages: 3 });
    expect(pageSlice(items, 3, 50).items).toHaveLength(20);
    expect(pageSlice(items, 9, 50).page).toBe(3);
    expect(pageSlice([], 1, 50)).toMatchObject({ page: 1, pages: 1 });
  });
  it('ページ番号は前後だけ並べ、間は … にする', () => {
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3]);
    expect(pageNumbers(5, 10)).toEqual([1, '…', 4, 5, 6, '…', 10]);
  });
});
