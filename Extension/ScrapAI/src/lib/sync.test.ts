import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCategory, db, deleteScraps, setCategoryOn, updateScrap } from './db';
import { buildSyncFile, mergeSyncFile, parseSyncFile, syncOnce, type SyncDir, type SyncFile } from './sync';
import type { ExtractResult } from './extract-page';
import { saveFromPage } from './save';

// 2台のPCを1つのDBで再現する: 端末ごとのDBの中身を退避・復元して切り替える
type Dump = Record<string, unknown[]>;
const TABLES = ['scraps', 'fragments', 'aiAnswers', 'categories', 'siteProfiles', 'promptTemplates', 'snapshots', 'tombstones', 'meta'];
async function dumpDb(): Promise<Dump> {
  const out: Dump = {};
  for (const t of TABLES) out[t] = await db.table(t).toArray();
  return out;
}
async function loadDb(d: Dump | null) {
  for (const t of TABLES) {
    await db.table(t).clear();
    if (d?.[t]?.length) await db.table(t).bulkAdd(d[t]!);
  }
}
const pcs: Record<string, Dump | null> = { A: null, B: null };
let current = 'A';
async function use(pc: 'A' | 'B') {
  pcs[current] = await dumpDb();
  await loadDb(pcs[pc]!);
  current = pc;
  if (!(await db.meta.get('deviceId'))) await db.meta.put({ key: 'deviceId', value: `pc-${pc}` });
}

// メモリ上の同期フォルダ（クラウドのアプリが同期している状態を再現）
const files = new Map<string, { text: string; at: number }>();
let clock = 1_000_000;
const dir: SyncDir = {
  async list() { return [...files].map(([name, f]) => ({ name, lastModified: f.at })); },
  async read(name) { return files.get(name)!.text; },
  async write(name, text) { files.set(name, { text, at: ++clock }); },
};

const ex = (url: string): ExtractResult => ({ url, title: url, ogTitle: '', siteName: '', description: '', ogImage: '', faviconUrl: '', selection: '本文 ' + url, articleTitle: '', articleText: '', lang: '' });
const save = async (url: string) => (await saveFromPage({ url, title: url }, async () => ex(url), { articleMaxChars: 3000 })).scrapId!;

describe('同期（同期フォルダ方式）', () => {
  beforeEach(async () => {
    files.clear();
    pcs.A = null; pcs.B = null; current = 'A';
    await loadDb(null);
    await db.meta.put({ key: 'deviceId', value: 'pc-A' });
  });

  it('追加・更新・削除が他のPCに伝わり、消したものは戻らない', async () => {
    const id = await save('https://a.example/1');
    await syncOnce(dir);                          // A が書き出す
    await use('B');
    let r = await syncOnce(dir);                  // B が読む
    expect(r.read).toHaveLength(1);
    expect((await db.scraps.get(id))?.url).toBe('https://a.example/1');
    expect(await db.fragments.where('scrapId').equals(id).count()).toBe(1);

    await updateScrap(id, { memo: 'Bで書いたメモ' });
    await syncOnce(dir);
    await use('A');
    await syncOnce(dir);
    expect((await db.scraps.get(id))?.memo).toBe('Bで書いたメモ'); // 新しい方が残る

    await deleteScraps([id]);
    await syncOnce(dir);
    await use('B');
    r = await syncOnce(dir);
    expect(await db.scraps.get(id)).toBeUndefined();
    expect(await db.fragments.where('scrapId').equals(id).count()).toBe(0);
    expect(r.removed).toBeGreaterThan(0);
    await syncOnce(dir);
    await use('A');
    await syncOnce(dir);
    expect(await db.scraps.get(id)).toBeUndefined(); // Bのファイルから復活しない
  });

  it('別々のPCで作った同じ名前のカテゴリは1つにまとめる', async () => {
    const a = await save('https://a.example/2');
    const ca = await createCategory('VRChat');
    await setCategoryOn([a], ca.id, true);
    await syncOnce(dir);
    await use('B');
    await createCategory('VRChat'); // B でも先に作っていた
    await syncOnce(dir);
    const cats = await db.categories.toArray();
    expect(cats.filter((c) => c.name === 'VRChat')).toHaveLength(1);
    expect((await db.scraps.get(a))?.categoryIds).toEqual([cats[0]!.id]);
  });

  it('変わっていなければ書き出さない', async () => {
    await save('https://a.example/3');
    expect((await syncOnce(dir)).wrote).toBe(true);
    expect((await syncOnce(dir)).wrote).toBe(false);
    await updateScrap((await db.scraps.toArray())[0]!.id, { memo: '変更' });
    expect((await syncOnce(dir)).wrote).toBe(true);
  });

  it('壊れた・書きかけのファイルは読み飛ばす。自分のファイルは読まない', async () => {
    files.set('scrapai-sync-broken.json', { text: '{"format":"scrapai-sync", "ver', at: 1 });
    const r = await syncOnce(dir);
    expect(r.read).toHaveLength(0);
    expect(parseSyncFile('{}')).toBeNull();
    const f: SyncFile = await buildSyncFile();
    expect(f.deviceId).toBe('pc-A');
    const rep = { added: 0, updated: 0, removed: 0 };
    await mergeSyncFile(f, rep);
    expect(rep.added + rep.updated).toBe(0); // 同じ内容なら何も変えない
  });
});
