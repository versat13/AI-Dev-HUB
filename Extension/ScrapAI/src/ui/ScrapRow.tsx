import { useEffect, useState } from 'preact/hooks';
import { t } from '@/lib/i18n';
import type { Category, Density, Scrap, Settings } from '@/lib/types';
import { formatDateTime } from './format';
import type { Job } from '@/lib/ai-run';
import type { Thumb } from './hooks';
import { Icon, SourceMark } from './icons';
import { canTranslate, looksForeign, targetLang, toggleScrapTranslation, translateNoteKey } from './translate';

export interface ScrapRowProps {
  scrap: Scrap;
  categories: Map<string, Category>;
  density: Density;
  preview?: string; // カード（大）・原文表示で出す本文の冒頭
  aiRun?: { job?: Job; onRun: (id: string) => void }; // AIボタン（ポップアップ・サイドパネルのカード右側）
  thumb?: Thumb; // スナップショット（カードに小さく出す。文字を押しのけない大きさに収める）
  face?: Settings['listFace'];
  active?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onOpen: (id: string) => void;
}

export const MAX_CATS = 2;

/** 星の欄。未評価でも5つ分の幅を取り、評価した分だけ★を出す（カードごとに位置をそろえる） */
export function Stars({ value }: { value: number | null }) {
  const n = value ?? 0;
  return (
    <span class="stars" role={n ? 'img' : undefined} aria-label={n ? t('starLabel', n) : undefined} aria-hidden={n ? undefined : true}>
      <span class="on">{'★'.repeat(n)}</span>
      <span class="off">{'★'.repeat(5 - n)}</span>
    </span>
  );
}

/** AIボタン: 押すだけでAIに要約させる。処理中・完了・失敗をボタンの表示で知らせる */
function AiRunButton({ scrapId, job, onRun }: { scrapId: string; job?: Job; onRun: (id: string) => void }) {
  // 動いている間は連絡が届く。届かなくなったら（タブを閉じた・止まった）失敗に戻す（API は連絡がないので長めに）
  const [, tick] = useState(0);
  useEffect(() => {
    if (job?.state !== 'running') return;
    const id = window.setInterval(() => tick((n) => n + 1), 5000);
    return () => window.clearInterval(id);
  }, [job?.state, job?.at]);
  const stale = job?.state === 'running' && Date.now() - job.at > (job.long ? 120_000 : 30_000);
  const state = stale ? 'failed' : job?.state === 'done' && Date.now() - job.at > 10_000 ? undefined : job?.state;
  const running = state === 'running';
  const label = running ? t('aiRunning') : state === 'done' ? t('aiRunDone') : state === 'failed' ? t('aiRunFailed') : t('aiRun');
  return (
    <button
      class={`ai-run${state ? ` ${state}` : ''}`}
      disabled={running}
      title={state === 'failed' ? `${t('aiRunFailedHelp')}${job?.reason ? ` (${job.reason})` : ''}` : t('aiRunHelp')}
      onClick={() => onRun(scrapId)}
    >
      <span class="mark" aria-hidden="true">{state === 'done' ? '✓' : '✦'}</span> {label}
    </button>
  );
}

/** カードに出すタイトルと概要。AI要約の表示・原文の表示・翻訳を反映する */
export function rowText(
  s: Scrap,
  face: Settings['listFace'] = 'ai',
  preview?: string,
): { title: string; excerpt: string; ai: boolean; aiTitle: boolean; translated: boolean } {
  const tr = s.translation?.on && s.translation.lang === targetLang() ? s.translation : undefined;
  if (face === 'ai' && s.aiExcerpt) {
    return { title: s.aiHeadline || s.title, excerpt: s.aiExcerpt, ai: true, aiTitle: !!s.aiHeadline, translated: false };
  }
  const title = tr?.title || (face === 'original' ? s.originalTitle ?? s.title : s.title);
  return { title, excerpt: tr?.excerpt || preview || s.excerpt, ai: false, aiTitle: false, translated: !!tr };
}

/**
 * 一覧の1行。強弱は3段階: タイトル > 概要 > 出典・日付。
 * 「AI要約なし」「未評価」のような“ないこと”は表示しない（あるものだけ印を出す）。
 */
export function ScrapRow(p: ScrapRowProps) {
  const s = p.scrap;
  const cats = s.categoryIds.map((id) => p.categories.get(id)).filter((c): c is Category => !!c);
  const hasAi = s.aiAnswerCount > 0;
  const view = rowText(s, p.face, p.preview);
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
          {view.aiTitle && (
            <span class="ai-badge" title={t('aiTitleBadge')}>
              AI
            </span>
          )}
          {view.title}
        </span>
        {view.excerpt && <span class={`row-excerpt${view.ai ? ' is-ai' : ''}`}>{view.excerpt}</span>}
        {p.thumb && <img class="row-thumb" src={p.thumb.url} width={p.thumb.width} height={p.thumb.height} alt="" loading="lazy" />}
        {/* 下段: 左に出典（幅をそろえる）と状態、右に星、右端にカテゴリ（幅をそろえる）。保存日時は詳細だけに出す */}
        <span class="row-meta">
          <span class="meta-src" title={`${s.domain} · ${formatDateTime(s.createdAt)}`}>
            <SourceMark domain={s.domain} />
            <span class="domain">{s.domain}</span>
          </span>
          <span class="meta-flags">
            {hasAi && <span class="ai-mark">✦ {t('aiYes', s.aiAnswerCount)}</span>}
            {view.translated && <span class="tag">{t('translated')}</span>}
            {s.extractStatus === 'failed' && <span class="warn">{t('noBody')}</span>}
            {s.archivedAt != null && <span class="badge">{t('archivedBadge')}</span>}
            {note && <span class="warn">{note}</span>}
          </span>
          <Stars value={s.stars} />
          <span class="meta-cats">
            {cats.slice(0, MAX_CATS).map((c) => (
              <span key={c.id} class="tag">{c.name}</span>
            ))}
            {cats.length > MAX_CATS && <span class="tag">{t('moreCats', cats.length - MAX_CATS)}</span>}
          </span>
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
            if (r === 'same') setNote(t('translateSame'));
            else if (r === 'unavailable' || r === 'pair' || r === 'failed') setNote(t(translateNoteKey(r)));
          }}
        >
          <Icon name="translate" size={15} />
        </button>
      )}
      {!showTranslate && canTranslate() && <span class="row-tr-slot" aria-hidden="true" />}
      {p.aiRun && <AiRunButton scrapId={s.id} job={p.aiRun.job} onRun={p.aiRun.onRun} />}
    </li>
  );
}
