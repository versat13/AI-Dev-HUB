import Dexie, { type Table } from 'dexie';
import { answerExcerpt } from './ai';
import { excerptOf, makeExcerpt } from './text';
import type {
  AiAnswer,
  Category,
  Fragment,
  PromptTemplate,
  Scrap,
  SiteProfile,
  Snapshot,
} from './types';

export const SCHEMA_VERSION = 3; // 2: snapshots を追加 / 3: scraps.aiExcerpt を埋める

class ScrapDB extends Dexie {
  scraps!: Table<Scrap, string>;
  fragments!: Table<Fragment, string>;
  aiAnswers!: Table<AiAnswer, string>;
  categories!: Table<Category, string>;
  siteProfiles!: Table<SiteProfile, string>;
  promptTemplates!: Table<PromptTemplate, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  snapshots!: Table<Snapshot, string>;

  constructor(name = 'scrapai') {
    super(name);
    // 注意: boolean と null は IndexedDB のキーにできないため pinned はインデックスしない
    // （一覧は件数が数千件までの想定なのでメモリ内フィルタで足りる）。
    this.version(1).stores({
      scraps: 'id, normalizedUrl, createdAt, updatedAt, domain, stars, archivedAt, *categoryIds',
      fragments: 'id, scrapId, [scrapId+order]',
      aiAnswers: 'id, scrapId',
      categories: 'id, order',
      siteProfiles: 'id, priority',
      promptTemplates: 'id, order',
      meta: 'key',
    });
    this.version(2)
      .stores({ snapshots: 'id, scrapId' })
      .upgrade((tx) => tx.table('meta').put({ key: 'schemaVersion', value: 2 }));
    // 3: 既存のAI回答から一覧用の要点（aiExcerpt）を作る
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        const answers = (await tx.table('aiAnswers').toArray()) as AiAnswer[];
        const latest = new Map<string, AiAnswer>();
        for (const a of answers) {
          const cur = latest.get(a.scrapId);
          if (!cur || a.createdAt > cur.createdAt) latest.set(a.scrapId, a);
        }
        for (const [scrapId, a] of latest) {
          if (a.parseStatus !== 'failed') await tx.table('scraps').update(scrapId, { aiExcerpt: answerExcerpt(a) });
        }
        await tx.table('meta').put({ key: 'schemaVersion', value: 3 });
      });
    this.on('populate', (tx) => {
      tx.table('meta').add({ key: 'schemaVersion', value: SCHEMA_VERSION });
    });
  }
}

export const db = new ScrapDB();

function uuid(): string {
  return crypto.randomUUID();
}

// ---- 取得 ----

/** 同じ normalizedUrl の項目のうち、最後に更新されたものを返す */
export async function findScrapByNormalizedUrl(normalizedUrl: string): Promise<Scrap | undefined> {
  const list = await db.scraps.where('normalizedUrl').equals(normalizedUrl).toArray();
  if (list.length === 0) return undefined;
  return list.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
}

export async function listFragments(scrapId: string): Promise<Fragment[]> {
  const list = await db.fragments.where('scrapId').equals(scrapId).toArray();
  return list.sort((a, b) => a.order - b.order);
}

// ---- 項目の更新 ----

export async function updateScrap(
  id: string,
  patch: Partial<Pick<Scrap, 'memo' | 'stars' | 'pinned' | 'categoryIds' | 'archivedAt' | 'title' | 'originalTitle'>>,
): Promise<void> {
  await db.scraps.update(id, { ...patch, updatedAt: Date.now() });
}

/** アーカイブ: 通常一覧から退避するだけで、データは消さない */
export async function archiveScraps(ids: string[]): Promise<void> {
  const now = Date.now();
  await db.scraps.where('id').anyOf(ids).modify((s) => {
    s.archivedAt = now;
    s.updatedAt = now;
  });
}

export async function restoreScraps(ids: string[]): Promise<void> {
  const now = Date.now();
  await db.scraps.where('id').anyOf(ids).modify((s) => {
    s.archivedAt = null;
    s.updatedAt = now;
  });
}

/** Scrap と配下の Fragment / AiAnswer を1トランザクションで完全削除する */
export async function deleteScraps(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction('rw', [db.scraps, db.fragments, db.aiAnswers, db.snapshots], async () => {
    await db.fragments.where('scrapId').anyOf(ids).delete();
    await db.aiAnswers.where('scrapId').anyOf(ids).delete();
    await db.snapshots.where('scrapId').anyOf(ids).delete();
    await db.scraps.bulkDelete(ids);
  });
}

export async function deleteScrap(id: string): Promise<void> {
  await deleteScraps([id]);
}

/** 複数項目にカテゴリを付ける／外す */
export async function setCategoryOn(ids: string[], categoryId: string, on: boolean): Promise<void> {
  const now = Date.now();
  await db.scraps.where('id').anyOf(ids).modify((s) => {
    const has = s.categoryIds.includes(categoryId);
    if (on && !has) s.categoryIds = [...s.categoryIds, categoryId];
    if (!on && has) s.categoryIds = s.categoryIds.filter((c) => c !== categoryId);
    s.updatedAt = now;
  });
}

// ---- カテゴリ ----

export async function createCategory(name: string): Promise<Category> {
  const trimmed = name.trim();
  const all = await db.categories.toArray();
  const dup = all.find((c) => c.name === trimmed);
  if (dup) return dup; // 同名は作らず既存を返す
  const now = Date.now();
  const category: Category = {
    id: uuid(),
    name: trimmed,
    order: all.reduce((m, c) => Math.max(m, c.order), -1) + 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.categories.add(category);
  return category;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  await db.categories.update(id, { name: trimmed, updatedAt: Date.now() });
}

/** カテゴリを削除し、各項目の categoryIds から外す（項目自体は残る） */
export async function deleteCategory(id: string): Promise<void> {
  await db.transaction('rw', db.categories, db.scraps, async () => {
    await db.scraps.where('categoryIds').equals(id).modify((s) => {
      s.categoryIds = s.categoryIds.filter((c) => c !== id);
    });
    await db.categories.delete(id);
  });
}

/** 並び順を1つ上／下へ動かす */
export async function moveCategory(id: string, dir: -1 | 1): Promise<void> {
  const all = (await db.categories.toArray()).sort((a, b) => a.order - b.order);
  const i = all.findIndex((c) => c.id === id);
  const j = i + dir;
  const a = all[i];
  const b = all[j];
  if (!a || !b) return;
  await db.transaction('rw', db.categories, async () => {
    await db.categories.update(a.id, { order: b.order });
    await db.categories.update(b.id, { order: a.order });
  });
}

// ---- 断片 ----

async function refreshExcerpt(scrapId: string): Promise<void> {
  const frags = await listFragments(scrapId);
  await db.scraps.update(scrapId, { excerpt: excerptOf(frags), updatedAt: Date.now() });
}

/** 断片を削除する（概要も作り直す）。保存の取り消しにも使う */
export async function deleteFragments(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.transaction('rw', db.scraps, db.fragments, async () => {
    const targets = await db.fragments.where('id').anyOf(ids).toArray();
    await db.fragments.bulkDelete(ids);
    for (const scrapId of new Set(targets.map((f) => f.scrapId))) await refreshExcerpt(scrapId);
  });
}

/**
 * 断片を別の項目に切り出す。元の項目と同じURL・タイトルで、評価・カテゴリ・メモは空から始める。
 * 断片が1つしかない項目からは切り出せない（空の項目ができるため）。
 */
export async function splitFragment(fragmentId: string): Promise<string | undefined> {
  return db.transaction('rw', db.scraps, db.fragments, async () => {
    const frag = await db.fragments.get(fragmentId);
    if (!frag) return undefined;
    const src = await db.scraps.get(frag.scrapId);
    if (!src) return undefined;
    const count = await db.fragments.where('scrapId').equals(src.id).count();
    if (count < 2) return undefined;

    const now = Date.now();
    const created: Scrap = {
      id: uuid(),
      url: src.url,
      normalizedUrl: src.normalizedUrl,
      title: src.title,
      siteName: src.siteName,
      domain: src.domain,
      ogImageUrl: src.ogImageUrl,
      faviconUrl: src.faviconUrl,
      profileId: src.profileId,
      extractStatus: 'ok',
      stars: null,
      pinned: false,
      archivedAt: null,
      categoryIds: [],
      memo: '',
      excerpt: makeExcerpt(frag.text),
      aiAnswerCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.scraps.add(created);
    await db.fragments.update(fragmentId, { scrapId: created.id, order: 0 });
    await refreshExcerpt(src.id);
    return created.id;
  });
}

// ---- サイトプロファイル ----

export async function listProfiles(): Promise<SiteProfile[]> {
  const list = await db.siteProfiles.toArray();
  return list.sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
}

/** 保存。組み込みを編集した場合は modified を立てる（以後の自動更新で上書きしない） */
export async function saveProfile(p: SiteProfile): Promise<void> {
  const now = Date.now();
  await db.siteProfiles.put({ ...p, modified: p.builtIn ? true : undefined, updatedAt: now });
}

export function newProfile(partial: Partial<SiteProfile> = {}): SiteProfile {
  const now = Date.now();
  return {
    id: uuid(),
    name: '',
    builtIn: false,
    enabled: true,
    urlPatterns: [],
    priority: 200, // ユーザー作成は組み込みより優先
    fields: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** 組み込みは削除できない（無効化する）。ユーザー作成のみ削除する */
export async function deleteProfile(id: string): Promise<void> {
  const p = await db.siteProfiles.get(id);
  if (p && !p.builtIn) await db.siteProfiles.delete(id);
}
