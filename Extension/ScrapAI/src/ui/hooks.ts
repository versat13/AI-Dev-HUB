import { liveQuery } from 'dexie';
import { browser } from 'wxt/browser';
import { JOBS_KEY, type Jobs } from '@/lib/ai-run';
import { useEffect, useState } from 'preact/hooks';
import { db } from '@/lib/db';
import { loadList, type ListData } from '@/lib/list';
import type { ListParams } from '@/lib/query';
import type { Category } from '@/lib/types';

/**
 * Dexie の liveQuery を購読する。DBが更新されると（別のタブ・ポップアップ・背景ページからの書き込みも含め）
 * 自動で再取得される。初回取得前は undefined。
 */
export function useLive<T>(fn: () => Promise<T>, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(fn).subscribe({
      next: (v) => setValue(() => v),
      error: (e) => console.error('liveQuery failed', e),
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

// ドメインのアイコン。一覧の行ごとに購読すると重いので、全体で1つだけ購読して配る
const faviconMap = new Map<string, string>();
const faviconListeners = new Set<() => void>();
let faviconSub: { unsubscribe(): void } | null = null;
function startFavicons() {
  if (faviconSub) return;
  faviconSub = liveQuery(() => db.favicons.toArray()).subscribe({
    next: (rows) => {
      faviconMap.clear();
      for (const r of rows) faviconMap.set(r.domain, r.data);
      faviconListeners.forEach((f) => f());
    },
    error: () => undefined,
  });
}

/** そのドメインの保存済みアイコン（dataURL）。なければ undefined */
export function useFavicon(domain: string): string | undefined {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    faviconListeners.add(f);
    startFavicons();
    return () => void faviconListeners.delete(f);
  }, []);
  return faviconMap.get(domain);
}

export interface Thumb {
  url: string;
  width: number;
  height: number;
}

/** 項目ごとの最初のスナップショット（カードに小さく出す用）。ids はカンマ区切り。空なら何もしない */
export function useThumbs(ids: string): Map<string, Thumb> {
  const snaps = useLive(async () => {
    if (!ids) return null;
    const list = (await db.snapshots.where('scrapId').anyOf(ids.split(',')).toArray()).sort((a, b) => a.createdAt - b.createdAt);
    const first = new Map<string, (typeof list)[number]>();
    for (const s of list) if (!first.has(s.scrapId)) first.set(s.scrapId, s);
    return [...first.values()];
  }, [ids]);
  const [map, setMap] = useState<Map<string, Thumb>>(new Map());
  useEffect(() => {
    const urls: string[] = [];
    const next = new Map<string, Thumb>();
    for (const s of snaps ?? []) {
      const url = URL.createObjectURL(s.blob);
      urls.push(url);
      next.set(s.scrapId, { url, width: s.width, height: s.height });
    }
    setMap(next);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [snaps]);
  return map;
}

/** AIボタンの処理状況（背景ページが storage.session に書く）。カードごとの「処理中・完了・失敗」の表示に使う */
export function useAiJobs(): Jobs {
  const [jobs, setJobs] = useState<Jobs>({});
  useEffect(() => {
    void browser.storage.session.get(JOBS_KEY).then((r) => setJobs((r[JOBS_KEY] as Jobs | undefined) ?? {}));
    const on = (c: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'session' && c[JOBS_KEY]) setJobs((c[JOBS_KEY].newValue as Jobs | undefined) ?? {});
    };
    browser.storage.onChanged.addListener(on);
    return () => browser.storage.onChanged.removeListener(on);
  }, []);
  return jobs;
}

export function useCategories(): Category[] {
  return (
    useLive(async () => (await db.categories.toArray()).sort((a, b) => a.order - b.order), []) ?? []
  );
}

export function useListData(params: ListParams): ListData | undefined {
  return useLive(() => loadList(params), [JSON.stringify(params)]);
}
