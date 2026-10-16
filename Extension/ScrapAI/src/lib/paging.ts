// ページ送りの計算（画面に依存しない純粋関数）

/** 配列から1ページ分を切り出す。ページ番号は範囲内に丸める */
export function pageSlice<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number } {
  const per = Math.max(1, Math.floor(size) || 1);
  const pages = Math.max(1, Math.ceil(items.length / per));
  const p = Math.min(Math.max(1, page), pages);
  return { items: items.slice((p - 1) * per, p * per), page: p, pages };
}

/** 表示するページ番号（先頭・末尾・今のページの前後。間は … で省く） */
export function pageNumbers(page: number, pages: number): (number | '…')[] {
  const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const n of [...set].sort((a, b) => a - b)) {
    if (n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  }
  return out;
}
