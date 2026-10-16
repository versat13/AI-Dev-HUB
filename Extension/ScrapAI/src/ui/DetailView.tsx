import { useEffect, useRef, useState } from 'preact/hooks';
import {
  archiveScraps,
  createCategory,
  db,
  deleteFragments,
  deleteScraps,
  listFragments,
  restoreScraps,
  setCategoryOn,
  splitFragment,
  updateScrap,
} from '@/lib/db';
import { t } from '@/lib/i18n';
import { AiPanel } from './AiPanel';
import { fragLabel, formatDateTime } from './format';
import { useCategories, useLive } from './hooks';

/** 項目の詳細: タイトル・評価・ピン・カテゴリ・メモ・断片・アーカイブ操作 */
export function DetailView(props: {
  scrapId: string;
  onClose?: () => void;
  closeLabel?: string;
  onOpenOther?: (id: string) => void; // 切り出した項目を開く
}) {
  const { scrapId } = props;
  const scrap = useLive(async () => (await db.scraps.get(scrapId)) ?? null, [scrapId]);
  const frags = useLive(() => listFragments(scrapId), [scrapId]) ?? [];
  const categories = useCategories();

  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [newCat, setNewCat] = useState('');
  const loadedFor = useRef<string | null>(null);
  const memoTimer = useRef<number | undefined>(undefined);
  const pendingMemo = useRef<string | null>(null);

  // 項目を切り替えたときだけ入力欄を初期化する（編集中に他タブの更新で上書きしない）
  useEffect(() => {
    if (scrap && loadedFor.current !== scrap.id) {
      loadedFor.current = scrap.id;
      setTitle(scrap.title);
      setMemo(scrap.memo);
    }
  }, [scrap]);

  const flushMemo = () => {
    window.clearTimeout(memoTimer.current);
    if (pendingMemo.current !== null) {
      void updateScrap(scrapId, { memo: pendingMemo.current });
      pendingMemo.current = null;
    }
  };
  // 閉じる・切り替え時に未保存のメモを書き込む
  useEffect(() => {
    window.addEventListener('pagehide', flushMemo);
    return () => {
      window.removeEventListener('pagehide', flushMemo);
      flushMemo();
    };
  }, [scrapId]);

  if (scrap === undefined) return <p class="empty" role="status">…</p>;
  if (scrap === null) {
    return (
      <div class="detail">
        <p class="empty">{t('itemNotFound')}</p>
        {props.onClose && <button onClick={props.onClose}>{props.closeLabel ?? t('back')}</button>}
      </div>
    );
  }

  const archived = scrap.archivedAt != null;
  const hasAi = scrap.aiAnswerCount > 0;

  async function commitTitle() {
    const next = title.trim();
    if (!next) return setTitle(scrap!.title);
    if (next !== scrap!.title) await updateScrap(scrapId, { title: next });
  }

  async function onMemoInput(v: string) {
    setMemo(v);
    pendingMemo.current = v;
    window.clearTimeout(memoTimer.current);
    memoTimer.current = window.setTimeout(flushMemo, 600);
  }

  async function addCategory() {
    const name = newCat.trim();
    if (!name) return;
    const c = await createCategory(name);
    await setCategoryOn([scrapId], c.id, true);
    setNewCat('');
  }

  async function removeForever() {
    if (!window.confirm(t('confirmDeleteForever'))) return;
    await deleteScraps([scrapId]);
    props.onClose?.();
  }

  async function split(fragId: string) {
    const newId = await splitFragment(fragId);
    if (newId) props.onOpenOther?.(newId);
  }

  return (
    <article class="detail">
      {props.onClose && (
        <button class="link back" onClick={props.onClose}>
          ← {props.closeLabel ?? t('back')}
        </button>
      )}

      <input
        class="title-input"
        value={title}
        aria-label={t('titleLabel')}
        onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <p class="detail-meta">
        <a href={scrap.url} target="_blank" rel="noopener noreferrer">{t('openPage')} ↗</a>
        <span class="domain">{scrap.domain}</span>
        <span>{t('savedAt', formatDateTime(scrap.createdAt))}</span>
        <span class={hasAi ? 'ai ai-yes' : 'ai ai-none'}>
          {hasAi ? `✦ ${t('aiYes', scrap.aiAnswerCount)}` : t('aiNone')}
        </span>
        {archived && <span class="badge">{t('archivedBadge')}</span>}
      </p>

      <div class="row-actions" role="group" aria-label={t('rating')}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            class="star"
            aria-label={t('starLabel', n)}
            aria-pressed={(scrap.stars ?? 0) >= n}
            onClick={() => updateScrap(scrapId, { stars: scrap.stars === n ? null : n })}
          >
            {(scrap.stars ?? 0) >= n ? '★' : '☆'}
          </button>
        ))}
        <button
          class="pin-btn"
          aria-pressed={scrap.pinned}
          onClick={() => updateScrap(scrapId, { pinned: !scrap.pinned })}
        >
          {scrap.pinned ? `📌 ${t('pinned')}` : `📍 ${t('pin')}`}
        </button>
      </div>

      <h3>{t('categories')}</h3>
      <div class="chips">
        {categories.length === 0 && <span class="muted">{t('noCategories')}</span>}
        {categories.map((c) => {
          const on = scrap.categoryIds.includes(c.id);
          return (
            <button
              key={c.id}
              class="chip toggle-chip"
              aria-pressed={on}
              onClick={() => setCategoryOn([scrapId], c.id, !on)}
            >
              {on ? '✓ ' : ''}{c.name}
            </button>
          );
        })}
      </div>
      <form
        class="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void addCategory();
        }}
      >
        <input
          value={newCat}
          placeholder={t('newCategory')}
          aria-label={t('newCategory')}
          onInput={(e) => setNewCat((e.target as HTMLInputElement).value)}
        />
        <button type="submit" disabled={!newCat.trim()}>{t('addCategory')}</button>
      </form>

      <h3>{t('memo')}</h3>
      <textarea
        rows={3}
        value={memo}
        placeholder={t('memoPlaceholder')}
        aria-label={t('memo')}
        onInput={(e) => onMemoInput((e.target as HTMLTextAreaElement).value)}
        onBlur={flushMemo}
      />

      <h3>{t('fragments', frags.length)}</h3>
      {frags.length === 0 && <p class="muted">{t('noFragments')}</p>}
      <ul class="frags">
        {frags.map((f) => (
          <li key={f.id} class="frag">
            <div class="frag-head">
              <strong>{fragLabel(f.fieldLabel)}</strong>
              {f.anchor && <span class="muted">{f.anchor}</span>}
              {f.truncated && <span class="badge">{t('fragTruncated')}</span>}
              <span class="spacer" />
              {frags.length > 1 && (
                <button class="link" onClick={() => split(f.id)}>{t('fragSplit')}</button>
              )}
              <button
                class="link"
                onClick={async () => {
                  if (window.confirm(t('confirmDeleteFragment'))) await deleteFragments([f.id]);
                }}
              >
                {t('fragDelete')}
              </button>
            </div>
            {/* 抽出結果は常にプレーンテキストとして表示する（HTMLとして解釈しない） */}
            <pre class="frag-text">{f.text}</pre>
            {(f.extras?.length || f.permalink) && (
              <p class="frag-extras muted">
                {f.extras?.map((x) => `${fragLabel(x.label)}: ${x.text}`).join(' · ')}
                {f.permalink && (
                  <>
                    {f.extras?.length ? ' · ' : ''}
                    <a href={f.permalink} target="_blank" rel="noreferrer noopener">{t('openPage')}</a>
                  </>
                )}
              </p>
            )}
          </li>
        ))}
      </ul>

      <AiPanel scrap={scrap} frags={frags} />

      <div class="danger-zone">
        {!archived ? (
          <button onClick={() => archiveScraps([scrapId])}>{t('archive')}</button>
        ) : (
          <>
            <button onClick={() => restoreScraps([scrapId])}>{t('restore')}</button>
            <button class="danger" onClick={removeForever}>{t('deleteForever')}</button>
          </>
        )}
      </div>
    </article>
  );
}
