import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { addAiAnswer } from './ai-db';
import { createCategory, db, listFragments, setCategoryOn } from './db';
import { buildExport, DEFAULT_EXPORT_OPTIONS } from './export';
import { importData, parseExport } from './import';
import type { ExtractResult } from './extract-page';
import { saveFromPage } from './save';
import { DEFAULT_SETTINGS } from './types';

const ex = (url: string, sel: string): ExtractResult => ({
  url, title: 'T' + url, ogTitle: '', siteName: '', description: '', ogImage: '',
  faviconUrl: '', selection: sel, articleTitle: '', articleText: '', lang: '',
});
const st = { articleMaxChars: 3000 as number | null };
const OPTS = { ...DEFAULT_EXPORT_OPTIONS, settings: null };

async function clearAll() {
  for (const t of db.tables) await t.clear();
}

async function seed() {
  const a = await saveFromPage({ url: 'https://a.example/1', title: 'A' }, async () => ex('https://a.example/1', 'あいう'), st);
  await saveFromPage({ url: 'https://b.example/2', title: 'B' }, async () => ex('https://b.example/2', 'かきく'), st);
  const cat = await createCategory('調査');
  await setCategoryOn([a.scrapId!], cat.id, true);
  await db.scraps.update(a.scrapId!, { stars: 4, pinned: true });
  await addAiAnswer({ scrapId: a.scrapId!, raw: '## 要点\n- テスト' });
  return a.scrapId!;
}

describe('export / import', () => {
  beforeEach(clearAll);

  it('往復で内容が一致する', async () => {
    const id = await seed();
    const file = JSON.parse(JSON.stringify(await buildExport(OPTS)));
    await clearAll();
    const r = await importData(parseExport(JSON.stringify(file)), 'skip');
    expect(r.scraps).toBe(2);
    const s = (await db.scraps.toArray()).find((x) => x.url === 'https://a.example/1')!;
    expect(s.id).toBe(id);
    expect(s.stars).toBe(4);
    expect(s.pinned).toBe(true);
    expect(s.aiAnswerCount).toBe(1);
    expect(s.categoryIds).toHaveLength(1);
    expect((await listFragments(s.id))[0]!.text).toBe('あいう');
    expect(await db.aiAnswers.count()).toBe(1);
    expect((await db.categories.toArray())[0]!.name).toBe('調査');
  });

  it('星・ピン・カテゴリ・AI回答を外せる', async () => {
    await seed();
    const file = await buildExport({ ...OPTS, organize: false, aiAnswers: false });
    expect(file.categories).toEqual([]);
    expect(file.aiAnswers).toBeUndefined();
    expect(file.scraps.every((s) => s.stars === null && !s.pinned && s.categoryIds.length === 0 && s.aiAnswerCount === 0)).toBe(true);
  });

  it('設定は指定したときだけ含まれる', async () => {
    expect((await buildExport(OPTS)).settings).toBeUndefined();
    expect((await buildExport({ ...OPTS, settings: DEFAULT_SETTINGS })).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('不正なファイルは拒否し、何も書き込まない', async () => {
    await seed();
    const before = await db.scraps.count();
    expect(() => parseExport('not json')).toThrow('invalid-json');
    expect(() => parseExport('{"format":"x"}')).toThrow('invalid-format');
    expect(() => parseExport('{"format":"scrapai-export","version":99,"scraps":[],"fragments":[],"categories":[]}')).toThrow('unsupported-version');
    expect(() => parseExport('{"format":"scrapai-export","version":1,"scraps":[{"id":1}],"fragments":[],"categories":[]}')).toThrow('invalid-data');
    expect(await db.scraps.count()).toBe(before);
  });

  it('重複: skip / overwrite / add', async () => {
    await seed();
    const file = parseExport(JSON.stringify(await buildExport(OPTS)));

    const skip = await importData(file, 'skip');
    expect(skip).toMatchObject({ scraps: 0, skipped: 2 });
    expect(await db.scraps.count()).toBe(2);

    const over = await importData(file, 'overwrite');
    expect(over.scraps).toBe(2);
    expect(await db.scraps.count()).toBe(2);
    expect(await db.fragments.count()).toBe(2);
    expect(await db.aiAnswers.count()).toBe(1);

    const add = await importData(file, 'add');
    expect(add.scraps).toBe(2);
    expect(await db.scraps.count()).toBe(4);
    // 付け替え後も断片・回答が正しい項目を指す
    for (const s of await db.scraps.toArray()) expect(await listFragments(s.id)).toHaveLength(1);
    for (const a of await db.aiAnswers.toArray()) expect(await db.scraps.get(a.scrapId)).toBeTruthy();
    expect((await db.categories.toArray())).toHaveLength(1); // 同名カテゴリは寄せる
  });
});
