import { t } from '@/lib/i18n';
import type { Category, Scrap } from '@/lib/types';
import { formatDateTime } from './format';

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

export function Stars({ value }: { value: number | null }) {
  if (value == null) return <span class="stars unrated">☆ {t('ratingUnrated')}</span>;
  return (
    <span class="stars" role="img" aria-label={t('starLabel', value)}>
      {'★'.repeat(value)}
      {'☆'.repeat(5 - value)}
    </span>
  );
}

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
              📌{' '}
            </span>
          )}
          {s.title}
        </span>
        {s.excerpt && <span class="row-excerpt">{s.excerpt}</span>}
        <span class="row-meta">
          <span class="domain">{s.domain}</span>
          <span>{formatDateTime(s.createdAt)}</span>
          <span class={hasAi ? 'ai ai-yes' : 'ai ai-none'}>
            {hasAi ? `✦ ${t('aiYes', s.aiAnswerCount)}` : t('aiNone')}
          </span>
          <Stars value={s.stars} />
          {s.extractStatus === 'failed' && <span class="warn">⚠ {t('noBody')}</span>}
          {s.archivedAt != null && <span class="badge">{t('archivedBadge')}</span>}
          {cats.slice(0, MAX_CATS).map((c) => (
            <span key={c.id} class="chip">{c.name}</span>
          ))}
          {cats.length > MAX_CATS && <span class="chip">{t('moreCats', cats.length - MAX_CATS)}</span>}
        </span>
      </button>
    </li>
  );
}
