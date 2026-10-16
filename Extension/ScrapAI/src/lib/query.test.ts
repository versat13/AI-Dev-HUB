import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, domainCounts, filterScraps, isFiltered, type ListParams } from './query';
import type { Scrap } from './types';

let n = 0;
function scrap(p: Partial<Scrap> = {}): Scrap {
  n += 1;
  return {
    id: `s${n}`,
    url: `https://example.com/${n}`,
    normalizedUrl: `https://example.com/${n}`,
    title: `title ${n}`,
    siteName: '',
    domain: 'example.com',
    extractStatus: 'ok',
    stars: null,
    pinned: false,
    archivedAt: null,
    categoryIds: [],
    memo: '',
    excerpt: '',
    aiAnswerCount: 0,
    createdAt: n * 1000,
    updatedAt: n * 1000,
    ...p,
  };
}
const P = (p: Partial<ListParams> = {}): ListParams => ({ ...DEFAULT_PARAMS, ...p });
const ids = (list: Scrap[]) => list.map((s) => s.id);

describe('filterScraps: 表示範囲', () => {
  const a = scrap({ id: 'a' });
  const b = scrap({ id: 'b', archivedAt: 5 });
  it('既定ではアーカイブを含まない', () => {
    expect(ids(filterScraps([a, b], P()))).toEqual(['a']);
  });
  it('アーカイブのみ／すべて', () => {
    expect(ids(filterScraps([a, b], P({ view: 'archived' })))).toEqual(['b']);
    expect(ids(filterScraps([a, b], P({ view: 'all' }))).sort()).toEqual(['a', 'b']);
  });
});

describe('filterScraps: 絞り込み', () => {
  const x = scrap({ id: 'x', domain: 'x.com', stars: 5, pinned: true, aiAnswerCount: 2, categoryIds: ['c1'] });
  const y = scrap({ id: 'y', domain: 'github.com', stars: 2, categoryIds: ['c1', 'c2'] });
  const z = scrap({ id: 'z', domain: 'github.com', stars: null });
  const all = [x, y, z];

  it('ドメイン', () => expect(ids(filterScraps(all, P({ domain: 'github.com', sort: 'created-asc' })))).toEqual(['y', 'z']));
  it('AI要約 なし／あり', () => {
    expect(ids(filterScraps(all, P({ ai: 'none', sort: 'created-asc' })))).toEqual(['y', 'z']);
    expect(ids(filterScraps(all, P({ ai: 'has' })))).toEqual(['x']);
  });
  it('未評価', () => expect(ids(filterScraps(all, P({ rating: 'unrated' })))).toEqual(['z']));
  it('星N以上（未評価は含まない）', () => {
    expect(ids(filterScraps(all, P({ rating: 2, sort: 'created-asc' })))).toEqual(['x', 'y']);
    expect(ids(filterScraps(all, P({ rating: 5 })))).toEqual(['x']);
  });
  it('ピン留めのみ', () => expect(ids(filterScraps(all, P({ pinnedOnly: true })))).toEqual(['x']));
  it('カテゴリ（複数付与・未分類）', () => {
    expect(ids(filterScraps(all, P({ category: 'c1', sort: 'created-asc' })))).toEqual(['x', 'y']);
    expect(ids(filterScraps(all, P({ category: 'c2' })))).toEqual(['y']);
    expect(ids(filterScraps(all, P({ category: 'none' })))).toEqual(['z']);
  });
  it('条件の組み合わせ', () => {
    expect(ids(filterScraps(all, P({ domain: 'github.com', rating: 2, category: 'c2' })))).toEqual(['y']);
  });
});

describe('filterScraps: 検索', () => {
  const a = scrap({ id: 'a', title: 'ローカルLLMの設定', memo: 'あとで試す' });
  const b = scrap({ id: 'b', title: 'Prompt tips', url: 'https://x.com/user/status/1' });
  const c = scrap({ id: 'c', title: '無関係' });
  const all = [a, b, c];

  it('タイトル・メモ・URLを大文字小文字を区別せず検索する', () => {
    expect(ids(filterScraps(all, P({ q: 'llm' })))).toEqual(['a']);
    expect(ids(filterScraps(all, P({ q: '試す' })))).toEqual(['a']);
    expect(ids(filterScraps(all, P({ q: 'STATUS' })))).toEqual(['b']);
  });
  it('複数語はAND検索', () => {
    expect(ids(filterScraps(all, P({ q: 'ローカル 設定' })))).toEqual(['a']);
    expect(ids(filterScraps(all, P({ q: 'ローカル tips' })))).toEqual([]);
  });
  it('断片テキストも検索対象になる', () => {
    const frag = new Map([['c', 'レス123: 量子化のコツ']]);
    expect(ids(filterScraps(all, P({ q: '量子化' }), frag))).toEqual(['c']);
    expect(ids(filterScraps(all, P({ q: '量子化' })))).toEqual([]);
  });
});

describe('filterScraps: 並び替え', () => {
  const a = scrap({ id: 'a', createdAt: 1, updatedAt: 30, stars: 3, title: 'b' });
  const b = scrap({ id: 'b', createdAt: 2, updatedAt: 10, stars: 5, title: 'a' });
  const c = scrap({ id: 'c', createdAt: 3, updatedAt: 20, stars: null, title: 'c' });
  const all = [a, b, c];
  const order = (sort: ListParams['sort']) => ids(filterScraps(all, P({ sort })));

  it('保存日時', () => {
    expect(order('created-desc')).toEqual(['c', 'b', 'a']);
    expect(order('created-asc')).toEqual(['a', 'b', 'c']);
  });
  it('更新日時', () => expect(order('updated-desc')).toEqual(['a', 'c', 'b']));
  it('星評価（未評価は最後）', () => expect(order('stars-desc')).toEqual(['b', 'a', 'c']));
  it('タイトル', () => expect(order('title-asc')).toEqual(['b', 'a', 'c']));

  it('ピン留めを先頭に出せる（グループ内の並びは維持）', () => {
    const p1 = scrap({ id: 'p1', createdAt: 1, pinned: true });
    const p2 = scrap({ id: 'p2', createdAt: 9, pinned: true });
    const u = scrap({ id: 'u', createdAt: 5 });
    expect(ids(filterScraps([u, p1, p2], P({ pinnedFirst: true })))).toEqual(['p2', 'p1', 'u']);
    expect(ids(filterScraps([u, p1, p2], P({ pinnedFirst: false })))).toEqual(['p2', 'u', 'p1']);
  });
});

describe('domainCounts / isFiltered', () => {
  it('件数の多い順に数え、表示範囲に合わせる', () => {
    const list = [
      scrap({ domain: 'a.com' }),
      scrap({ domain: 'b.com' }),
      scrap({ domain: 'b.com' }),
      scrap({ domain: 'a.com', archivedAt: 1 }),
    ];
    expect(domainCounts(list, 'active')).toEqual([
      { domain: 'b.com', count: 2 },
      { domain: 'a.com', count: 1 },
    ]);
    expect(domainCounts(list, 'archived')).toEqual([{ domain: 'a.com', count: 1 }]);
  });
  it('絞り込み中かを判定する（検索語と並び順は含めない）', () => {
    expect(isFiltered(P())).toBe(false);
    expect(isFiltered(P({ q: 'x', sort: 'title-asc' }))).toBe(false);
    expect(isFiltered(P({ rating: 'unrated' }))).toBe(true);
    expect(isFiltered(P({ view: 'archived' }))).toBe(true);
  });
});
