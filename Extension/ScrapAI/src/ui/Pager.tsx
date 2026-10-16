import { t } from '@/lib/i18n';
import { pageNumbers } from '@/lib/paging';

export { pageSlice } from '@/lib/paging';

/**
 * ページ送り。compact は「‹ 2 / 5 ›」（ポップアップ・サイドパネル用、右寄せ）、
 * 通常は番号つき（管理画面）。1ページしかなければ何も出さない。
 */
export function Pager({ page, pages, onPage, compact }: { page: number; pages: number; onPage: (p: number) => void; compact?: boolean }) {
  if (pages <= 1) return null;
  return (
    <nav class={`pager${compact ? ' compact' : ''}`} aria-label={t('pagerLabel')}>
      <button class="icon-btn" disabled={page <= 1} aria-label={t('pagerPrev')} title={t('pagerPrev')} onClick={() => onPage(page - 1)}>‹</button>
      {compact ? (
        <span class="pager-pos" aria-live="polite">{page} / {pages}</span>
      ) : (
        pageNumbers(page, pages).map((n, i) =>
          n === '…' ? (
            <span key={`g${i}`} class="pager-gap" aria-hidden="true">…</span>
          ) : (
            <button key={n} class={`pager-num${n === page ? ' on' : ''}`} aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n}</button>
          ),
        )
      )}
      <button class="icon-btn" disabled={page >= pages} aria-label={t('pagerNext')} title={t('pagerNext')} onClick={() => onPage(page + 1)}>›</button>
    </nav>
  );
}
