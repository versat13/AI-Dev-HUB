import type { Scrap } from './types';

// 一覧の検索・絞り込み・並び替え（仕様書5章）。DBに依存しない純粋関数にしてテストしやすくする。

export type ViewMode = 'active' | 'archived' | 'all';
export type SortField = 'created' | 'updated' | 'stars' | 'title' | 'domain';
export type SortKey = `${SortField}-${'asc' | 'desc'}`;

export interface ListParams {
  q: string;
  view: ViewMode;
  domain: string; // '' = すべて
  ai: 'any' | 'none' | 'has'; // AI要約の有無
  rating: 'any' | 'unrated' | 1 | 2 | 3 | 4 | 5; // 数値は「N以上」
  pinnedOnly: boolean;
  category: 'any' | 'none' | (string & {}); // 'none' = 未分類、それ以外はカテゴリID
  sort: SortKey;
  pinnedFirst: boolean;
}

export const DEFAULT_PARAMS: ListParams = {
  q: '',
  view: 'active',
  domain: '',
  ai: 'any',
  rating: 'any',
  pinnedOnly: false,
  category: 'any',
  sort: 'created-desc',
  pinnedFirst: true,
};

export function isFiltered(p: ListParams): boolean {
  return (
    p.domain !== '' ||
    p.ai !== 'any' ||
    p.rating !== 'any' ||
    p.pinnedOnly ||
    p.category !== 'any' ||
    p.view !== 'active'
  );
}

function inView(s: Scrap, view: ViewMode): boolean {
  if (view === 'all') return true;
  return view === 'archived' ? s.archivedAt != null : s.archivedAt == null;
}

/** 検索語をすべて含む（AND）か。検索対象はタイトル・URL・ドメイン・メモ・概要と、渡された断片テキスト */
function matchesQuery(s: Scrap, q: string, fragText?: Map<string, string>): boolean {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = [s.title, s.originalTitle ?? '', s.url, s.domain, s.memo, s.excerpt, fragText?.get(s.id) ?? '']
    .join('\n')
    .toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

function compare(a: Scrap, b: Scrap, sort: SortKey): number {
  const [field, dir] = sort.split('-') as [SortField, 'asc' | 'desc'];
  const sign = dir === 'asc' ? 1 : -1;
  const tie = b.createdAt - a.createdAt;
  switch (field) {
    case 'updated':
      return sign * (a.updatedAt - b.updatedAt) || tie;
    case 'stars':
      return sign * ((a.stars ?? 0) - (b.stars ?? 0)) || tie;
    case 'domain':
      return sign * a.domain.localeCompare(b.domain) || tie;
    case 'title':
      return sign * a.title.localeCompare(b.title) || tie;
    default:
      return sign * (a.createdAt - b.createdAt);
  }
}

export function filterScraps(
  all: Scrap[],
  p: ListParams,
  fragText?: Map<string, string>,
): Scrap[] {
  const out = all.filter((s) => {
    if (!inView(s, p.view)) return false;
    if (p.domain && s.domain !== p.domain) return false;
    if (p.ai === 'none' && s.aiAnswerCount > 0) return false;
    if (p.ai === 'has' && s.aiAnswerCount === 0) return false;
    if (p.rating === 'unrated' && s.stars !== null) return false;
    if (typeof p.rating === 'number' && (s.stars ?? 0) < p.rating) return false;
    if (p.pinnedOnly && !s.pinned) return false;
    if (p.category === 'none' && s.categoryIds.length > 0) return false;
    if (p.category !== 'any' && p.category !== 'none' && !s.categoryIds.includes(p.category)) {
      return false;
    }
    return matchesQuery(s, p.q, fragText);
  });

  out.sort((a, b) => compare(a, b, p.sort));
  if (p.pinnedFirst) {
    // 安定ソート: ピン留めを先頭へ（各グループ内の並びは維持）
    return [...out.filter((s) => s.pinned), ...out.filter((s) => !s.pinned)];
  }
  return out;
}

/** ドメイン別の件数（件数の多い順）。表示中のビューに合わせて数える */
export function domainCounts(all: Scrap[], view: ViewMode): { domain: string; count: number }[] {
  const map = new Map<string, number>();
  for (const s of all) {
    if (!inView(s, view) || !s.domain) continue;
    map.set(s.domain, (map.get(s.domain) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}
