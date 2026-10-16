import { t } from '@/lib/i18n';
import type { Category, Scrap } from '@/lib/types';
import { formatDateTime, formatRelative } from './format';
import { SourceMark } from './icons';

export interface ScrapRowProps {
  scrap: Scrap;
  categories: Map<string, Category>;
  density: 'compact' | 'card';
  active?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onOpen: (id: string) => void;
}

const MAX_CATS = 3;

/** 評価があるときだけ★を出す（未評価は何も出さない） */
export function Stars({ value }: { value: number | null }) {
  if (value == null) return null;
  return (
    <span class="stars" role="img" aria-label={t('starLabel', value)}>
      {'★'.repeat(value)}
    </span>
  );
}

/**
 * 一覧の1行。強弱は3段階: タイトル > 概要 > 出典・日付。
 * 「AI要約なし」「未評価」のような“ないこと”は表示しない（あるものだけ印を出す）。
 */
export function ScrapRow(p: ScrapRowProps) {
  const s = p.scrap;
  const cats = s.categoryIds.map((id) => p.categories.get(id)).filter((c): c is Category => !!c);
  const hasAi = s.aiAnswerCount > 0;

  return (
    <li class={`row ${p.density}${p.active ? ' active' : ''}${s.archivedAt != null ? ' archived' : ''}`}>
      {p.selectable && (
        <input
          type="checkbox"
          class="row-check"
          checked={!!p.selected}
          aria-label={s.title}
          onChange={() => p.onToggleSelect?.(s.id)}
        />
      )}
      <button class="row-main" onClick={() => p.onOpen(s.id)}>
        <span class="row-title">
          {s.pinned && (
            <span class="pin-mark" role="img" aria-label={t('pinned')} title={t('pinned')}>
              📌
            </span>
          )}
          {s.title}
        </span>
        {s.excerpt && <span class="row-excerpt">{s.excerpt}</span>}
        <span class="row-meta">
          <SourceMark domain={s.domain} />
          <span class="domain">{s.domain}</span>
          <time title={formatDateTime(s.createdAt)}>{formatRelative(s.createdAt)}</time>
          {hasAi && <span class="ai-mark">✦ {t('aiYes', s.aiAnswerCount)}</span>}
          <Stars value={s.stars} />
          {s.extractStatus === 'failed' && <span class="warn">{t('noBody')}</span>}
          {s.archivedAt != null && <span class="badge">{t('archivedBadge')}</span>}
          {cats.slice(0, MAX_CATS).map((c) => (
            <span key={c.id} class="tag">{c.name}</span>
          ))}
          {cats.length > MAX_CATS && <span class="tag">{t('moreCats', cats.length - MAX_CATS)}</span>}
        </span>
      </button>
    </li>
  );
}
