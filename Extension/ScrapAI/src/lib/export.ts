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
  snapshots?: ExportedSnapshot[];
}

export interface ExportedSnapshot {
  id: string;
  scrapId: string;
  width: number;
  height: number;
  createdAt: number;
  type: string;
  data: string; // base64
}

export interface ExportOptions {
  organize: boolean; // 星・ピン・カテゴリ（既定: 含める）
  aiAnswers: boolean;
  sites: boolean;
  templates: boolean;
  snapshots: boolean;
  settings: Settings | null; // null = 含めない
}

export const DEFAULT_EXPORT_OPTIONS: Omit<ExportOptions, 'settings'> = {
  organize: true,
  aiAnswers: true,
  sites: true,
  templates: true,
  snapshots: true,
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
  if (opts.snapshots) {
    file.snapshots = await Promise.all(
      (await db.snapshots.toArray()).map(async (s) => ({
        id: s.id,
        scrapId: s.scrapId,
        width: s.width,
        height: s.height,
        createdAt: s.createdAt,
        type: s.blob.type || 'image/webp',
        data: toBase64(new Uint8Array(await s.blob.arrayBuffer())),
      })),
    );
  }
  return file;
}

export function exportFileName(now = Date.now()): string {
  const d = new Date(now);
  const p = (n: number) => String(n).padStart(2, '0');
  return `scrapai-export-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
