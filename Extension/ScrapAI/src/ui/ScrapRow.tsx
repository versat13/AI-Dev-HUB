import { useState } from 'preact/hooks';
import { t } from '@/lib/i18n';
import type { Category, Scrap, Settings } from '@/lib/types';
import { formatDateTime, formatRelative } from './format';
import { Icon, SourceMark } from './icons';
import { canTranslate, looksForeign, targetLang, toggleScrapTranslation } from './translate';

export interface ScrapRowProps {
  scrap: Scrap;
  categories: Map<string, Category>;
  density: 'compact' | 'card';
  face?: Settings['listFace'];
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

/** カードに出すタイトルと概要。AI要約の表示・原文の表示・翻訳を反映する */
export function rowText(s: Scrap, face: Settings['listFace'] = 'ai'): { title: string; excerpt: string; ai: boolean; translated: boolean } {
  const tr = s.translation?.on && s.translation.lang === targetLang() ? s.translation : undefined;
  if (face === 'ai' && s.aiExcerpt) {
    return { title: s.title, excerpt: s.aiExcerpt, ai: true, translated: false };
  }
  const title = tr?.title || (face === 'original' ? s.originalTitle ?? s.title : s.title);
  return { title, excerpt: tr?.excerpt || s.excerpt, ai: false, translated: !!tr };
}

/**
 * 一覧の1行。強弱は3段階: タイトル > 概要 > 出典・日付。
 * 「AI要約なし」「未評価」のような“ないこと”は表示しない（あるものだけ印を出す）。
 */
export function ScrapRow(p: ScrapRowProps) {
  const s = p.scrap;
  const cats = s.categoryIds.map((id) => p.categories.get(id)).filter((c): c is Category => !!c);
  const hasAi = s.aiAnswerCount > 0;
  const view = rowText(s, p.face);
  const [note, setNote] = useState('');
  // 訳がある、またはAI要約を出していないときに外国語らしければ翻訳ボタンを出す
  const showTranslate =
    !view.ai && (!!s.translation || (canTranslate() && looksForeign(`${s.originalTitle ?? s.title} ${s.excerpt}`)));

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
          {view.title}
        </span>
        {view.excerpt && <span class={`row-excerpt${view.ai ? ' is-ai' : ''}`}>{view.excerpt}</span>}
        <span class="row-meta">
          <SourceMark domain={s.domain} />
          <span class="domain">{s.domain}</span>
          <time title={formatDateTime(s.createdAt)}>{formatRelative(s.createdAt)}</time>
          {hasAi && <span class="ai-mark">✦ {t('aiYes', s.aiAnswerCount)}</span>}
          {view.translated && <span class="tag">{t('translated')}</span>}
          <Stars value={s.stars} />
          {s.extractStatus === 'failed' && <span class="warn">{t('noBody')}</span>}
          {s.archivedAt != null && <span class="badge">{t('archivedBadge')}</span>}
          {cats.slice(0, MAX_CATS).map((c) => (
            <span key={c.id} class="tag">{c.name}</span>
          ))}
          {cats.length > MAX_CATS && <span class="tag">{t('moreCats', cats.length - MAX_CATS)}</span>}
          {note && <span class="warn">{note}</span>}
        </span>
      </button>
      {showTranslate && (
        <button
          class={`icon-btn row-tr${view.translated ? ' on' : ''}`}
          aria-label={view.translated ? t('showOriginal') : t('translate')}
          title={view.translated ? t('showOriginal') : t('translate')}
          onClick={async () => {
            setNote('');
            const r = await toggleScrapTranslation(s);
            if (r === 'unavailable') setNote(t('translateUnavailable'));
            if (r === 'same') setNote(t('translateSame'));
          }}
        >
          <Icon name="translate" size={15} />
        </button>
      )}
    </li>
  );
}
