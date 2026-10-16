import { liveQuery } from 'dexie';
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

export function useCategories(): Category[] {
  return (
    useLive(async () => (await db.categories.toArray()).sort((a, b) => a.order - b.order), []) ?? []
  );
}

export function useListData(params: ListParams): ListData | undefined {
  return useLive(() => loadList(params), [JSON.stringify(params)]);
}
