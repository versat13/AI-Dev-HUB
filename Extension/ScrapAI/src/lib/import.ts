import { db, deleteScraps } from './db';
import { EXPORT_FORMAT, EXPORT_VERSION, type ExportFile } from './export';
import type { AiAnswer, Category, Fragment, Scrap, Settings } from './types';

export type DuplicateMode = 'skip' | 'overwrite' | 'add';

export interface ImportResult {
  scraps: number;
  skipped: number;
  fragments: number;
  aiAnswers: number;
  categories: number;
  siteProfiles: number;
  promptTemplates: number;
  settings: Partial<Settings> | null; // 呼び出し側が storage に反映する
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown) => typeof v === 'string';
const arr = (v: unknown): unknown[] | null => (v === undefined ? [] : Array.isArray(v) ? v : null);

/** 形式を検証する。不正なら理由つきでthrowし、何も書き込まない */
export function parseExport(text: string): ExportFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('invalid-json');
  }
  if (!isObj(data) || data.format !== EXPORT_FORMAT) throw new Error('invalid-format');
  if (typeof data.version !== 'number' || data.version > EXPORT_VERSION) throw new Error('unsupported-version');
  const scraps = arr(data.scraps);
  const fragments = arr(data.fragments);
  const categories = arr(data.categories);
  if (!scraps || !fragments || !categories) throw new Error('invalid-data');
  const okScraps = scraps.every((s) => isObj(s) && isStr(s.id) && isStr(s.url) && isStr(s.normalizedUrl) && isStr(s.title));
  const okFrags = fragments.every((f) => isObj(f) && isStr(f.id) && isStr(f.scrapId) && isStr(f.text));
  const okCats = categories.every((c) => isObj(c) && isStr(c.id) && isStr(c.name));
  const answers = arr(data.aiAnswers);
  const okAns = !!answers && answers.every((a) => isObj(a) && isStr(a.id) && isStr(a.scrapId) && isStr(a.raw));
  for (const k of ['siteProfiles', 'promptTemplates'] as const) {
    const v = arr(data[k]);
    if (!v || !v.every((x) => isObj(x) && isStr(x.id))) throw new Error('invalid-data');
  }
  if (!okScraps || !okFrags || !okCats || !okAns) throw new Error('invalid-data');
  return data as unknown as ExportFile;
}

export async function importData(file: ExportFile, mode: DuplicateMode): Promise<ImportResult> {
  const now = Date.now();
  const res: ImportResult = {
    scraps: 0, skipped: 0, fragments: 0, aiAnswers: 0, categories: 0,
    siteProfiles: 0, promptTemplates: 0, settings: null,
  };

  await db.transaction('rw', [db.scraps, db.fragments, db.aiAnswers, db.categories, db.siteProfiles, db.promptTemplates], async () => {
    // カテゴリ: 同名は既存に寄せ、なければ追加（IDが衝突したら付け替え）
    const existingCats = await db.categories.toArray();
    const catMap = new Map<string, string>();
    let order = existingCats.reduce((m, c) => Math.max(m, c.order), -1) + 1;
    for (const c of file.categories) {
      const same = existingCats.find((e) => e.name === c.name);
      if (same) {
        catMap.set(c.id, same.id);
        continue;
      }
      const id: string = (await db.categories.get(c.id)) ? crypto.randomUUID() : c.id;
      const cat: Category = { ...c, id, order: order++, updatedAt: now };
      await db.categories.add(cat);
      existingCats.push(cat);
      catMap.set(c.id, id);
      res.categories++;
    }

    const fragsByScrap = new Map<string, Fragment[]>();
    for (const f of file.fragments) fragsByScrap.set(f.scrapId, [...(fragsByScrap.get(f.scrapId) ?? []), f]);
    const ansByScrap = new Map<string, AiAnswer[]>();
    for (const a of file.aiAnswers ?? []) ansByScrap.set(a.scrapId, [...(ansByScrap.get(a.scrapId) ?? []), a]);

    for (const s of file.scraps) {
      const dups = await db.scraps.where('normalizedUrl').equals(s.normalizedUrl).toArray();
      if (dups.length > 0) {
        if (mode === 'skip') {
          res.skipped++;
          continue;
        }
        if (mode === 'overwrite') await deleteScraps(dups.map((d) => d.id));
      }
      const newId: string = (await db.scraps.get(s.id)) ? crypto.randomUUID() : s.id;
      const srcFrags = fragsByScrap.get(s.id) ?? [];
      const frags: Fragment[] = srcFrags.map((f) => ({ ...f, id: crypto.randomUUID(), scrapId: newId }));
      const fragIdMap = new Map<string, string>(srcFrags.map((f, i) => [f.id, frags[i]!.id]));
      const answers: AiAnswer[] = (ansByScrap.get(s.id) ?? []).map((a) => ({
        ...a,
        id: crypto.randomUUID(),
        scrapId: newId,
        fragmentIds: a.fragmentIds?.map((x) => fragIdMap.get(x)).filter((x): x is string => !!x),
      }));
      const scrap: Scrap = {
        ...s,
        id: newId,
        categoryIds: (s.categoryIds ?? []).map((c) => catMap.get(c)).filter((c): c is string => !!c),
        aiAnswerCount: answers.length,
      };
      await db.scraps.add(scrap);
      await db.fragments.bulkAdd(frags);
      await db.aiAnswers.bulkAdd(answers);
      res.scraps++;
      res.fragments += frags.length;
      res.aiAnswers += answers.length;
    }

    for (const p of file.siteProfiles ?? []) {
      await db.siteProfiles.put(p);
      res.siteProfiles++;
    }
    for (const x of file.promptTemplates ?? []) {
      if (x.builtIn) continue;
      await db.promptTemplates.put(x);
      res.promptTemplates++;
    }
  });

  if (file.settings) res.settings = file.settings;
  return res;
}
