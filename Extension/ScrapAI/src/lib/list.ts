import { db } from './db';
import { domainCounts, filterScraps, type ListParams } from './query';
import type { Scrap } from './types';

export interface ListData {
  items: Scrap[];
  domains: { domain: string; count: number }[];
  total: number; // 全件数（アーカイブ含む）
}

/** liveQuery の中で呼ぶ。検索語があるときだけ断片とAI回答のテキストも読み込む */
export async function loadList(p: ListParams): Promise<ListData> {
  const all = await db.scraps.toArray();
  let fragText: Map<string, string> | undefined;
  if (p.q.trim()) {
    fragText = new Map();
    const add = (id: string, text: string) => fragText!.set(id, (fragText!.get(id) ?? '') + '\n' + text);
    await db.fragments.each((f) => add(f.scrapId, f.text));
    await db.aiAnswers.each((a) => add(a.scrapId, a.raw)); // AIの回答も検索対象にする
  }
  return {
    items: filterScraps(all, p, fragText),
    domains: domainCounts(all, p.view),
    total: all.length,
  };
}
