import { db } from './db';
import type { AiAnswer, Category, Fragment, PromptTemplate, Scrap, Settings, SiteProfile } from './types';

// エクスポート形式。拡張機能の名前やIDが変わってもデータを持ち運べるようにするためのJSON。

export const EXPORT_FORMAT = 'scrapai-export';
export const EXPORT_VERSION = 1;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: number;
  scraps: Scrap[];
  fragments: Fragment[];
  categories: Category[];
  aiAnswers?: AiAnswer[];
  siteProfiles?: SiteProfile[];
  promptTemplates?: PromptTemplate[];
  settings?: Settings;
}

export interface ExportOptions {
  organize: boolean; // 星・ピン・カテゴリ（既定: 含める）
  aiAnswers: boolean;
  sites: boolean;
  templates: boolean;
  settings: Settings | null; // null = 含めない
}

export const DEFAULT_EXPORT_OPTIONS: Omit<ExportOptions, 'settings'> = {
  organize: true,
  aiAnswers: true,
  sites: true,
  templates: true,
};

export async function buildExport(opts: ExportOptions, now = Date.now()): Promise<ExportFile> {
  let scraps = await db.scraps.toArray();
  const fragments = await db.fragments.toArray();
  let categories = await db.categories.toArray();
  const file: ExportFile = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now,
    scraps,
    fragments,
    categories,
  };
  if (!opts.organize) {
    scraps = scraps.map((s) => ({ ...s, stars: null, pinned: false, categoryIds: [] }));
    categories = [];
    file.scraps = scraps;
    file.categories = categories;
  }
  if (opts.aiAnswers) file.aiAnswers = await db.aiAnswers.toArray();
  else file.scraps = file.scraps.map((s) => ({ ...s, aiAnswerCount: 0 }));
  if (opts.sites) file.siteProfiles = await db.siteProfiles.toArray();
  if (opts.templates) file.promptTemplates = (await db.promptTemplates.toArray()).filter((x) => !x.builtIn);
  if (opts.settings) file.settings = opts.settings;
  return file;
}

export function exportFileName(now = Date.now()): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `scrapai-export-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}
