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
import { ConfirmDelete } from './ConfirmDelete';
import { Snapshots } from './Snapshots';
import { revertTitle } from '@/lib/ai-db';
import { fragLabel, formatDateTime } from './format';
import { Icon, SourceMark } from './icons';
import { useCategories, useLive } from './hooks';

// 詳細のタブは項目を切り替えても保つ（同じ画面を開いている間だけ）
let lastTab: 'body' | 'ai' = 'body';

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
  const [addingCat, setAddingCat] = useState(false);
  const [tab, setTab] = useState<'body' | 'ai'>(lastTab);
  const chooseTab = (v: 'body' | 'ai') => {
    lastTab = v;
    setTab(v);
  };
  const loadedFor = useRef<string | null>(null);
  const memoTimer = useRef<number | undefined>(undefined);
  const pendingMemo = useRef<string | null>(null);

  // 項目を切り替えたときだけ入力欄を初期化する（編集中に他タブの更新で上書きしない）
  const lastTitle = useRef('');
  useEffect(() => {
    if (scrap && loadedFor.current !== scrap.id) {
      loadedFor.current = scrap.id;
      lastTitle.current = scrap.title;
      setTitle(scrap.title);
      setMemo(scrap.memo);
    } else if (scrap && scrap.title !== lastTitle.current) {
      // タイトルが外部（日本語訳の適用など）で変わったとき、編集中でなければ反映する
      const prev = lastTitle.current;
      lastTitle.current = scrap.title;
      setTitle((cur) => (cur === prev ? scrap.title : cur));
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

  async function commitTitle() {
    const next = title.trim();
    if (!next) return setTitle(scrap!.title);
    // 手で付けたタイトルを新しい基準にする（以後の「元に戻す」はこのタイトルに戻る）
    if (next !== scrap!.title) await updateScrap(scrapId, { title: next, originalTitle: undefined });
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
    await deleteScraps([scrapId]);
    props.onClose?.();
  }

  async function split(fragId: string) {
    const newId = await splitFragment(fragId);
    if (newId) props.onOpenOther?.(newId);
  }


  return (
    <article class="detail">
      <div class="detail-top">
        {props.onClose && (
          <button class="link back" onClick={props.onClose}>
            <Icon name="back" size={14} /> {props.closeLabel ?? t('back')}
          </button>
        )}
        <span class="spacer" />
        <button
          class="icon-btn pin-btn"
          aria-pressed={scrap.pinned}
          aria-label={scrap.pinned ? t('pinned') : t('pin')}
          title={scrap.pinned ? t('pinned') : t('pin')}
          onClick={() => updateScrap(scrapId, { pinned: !scrap.pinned })}
        >
          📌
        </button>
        <details class="menu">
          <summary class="icon-btn" aria-label={t('moreActions')} title={t('moreActions')}>
            <Icon name="more" />
          </summary>
          <div
            class="menu-list"
            onClick={(e) => {
              // 操作したらメニューを閉じる
              const d = (e.currentTarget as HTMLElement).closest('details');
              if (d && (e.target as HTMLElement).closest('button') && !(e.target as HTMLElement).closest('.danger:not(.solid)')) d.open = false;
            }}
          >
            {!archived ? (
              <button onClick={() => archiveScraps([scrapId])}>{t('archive')}</button>
            ) : (
              <button onClick={() => restoreScraps([scrapId])}>{t('restore')}</button>
            )}
            <hr />
            <ConfirmDelete label={t('deleteForever')} question={t('confirmDeleteForever')} onConfirm={removeForever} />
          </div>
        </details>
      </div>

      <header class="detail-head">
        <textarea
          class="title-input"
          rows={1}
          value={title}
          aria-label={t('titleLabel')}
          onInput={(e) => setTitle((e.target as HTMLTextAreaElement).value.replace(/\n/g, ''))}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
        />
        {scrap.originalTitle && (
          <p class="original-title">
            {t('originalTitle', scrap.originalTitle)}{' '}
            <button class="link" onClick={() => revertTitle(scrapId)}>{t('translationRevert')}</button>
          </p>
        )}
        <p class="detail-meta">
          <SourceMark domain={scrap.domain} />
          <a href={scrap.url} target="_blank" rel="noopener noreferrer" class="src-link">
            {scrap.domain} <Icon name="external" size={12} />
          </a>
          <time title={formatDateTime(scrap.createdAt)}>{t('savedAt', formatDateTime(scrap.createdAt))}</time>
          {archived && <span class="badge">{t('archivedBadge')}</span>}
        </p>

        <div class="detail-tags">
          <div class="rating" role="group" aria-label={t('rating')}>
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
          </div>
          {/* カテゴリは押すだけで付け外しできる */}
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
          {addingCat ? (
            <form
              class="inline-form cat-add"
              onSubmit={(e) => {
                e.preventDefault();
                void addCategory().then(() => setAddingCat(false));
              }}
            >
              <input
                value={newCat}
                placeholder={t('newCategory')}
                aria-label={t('newCategory')}
                autoFocus
                onInput={(e) => setNewCat((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => e.key === 'Escape' && setAddingCat(false)}
              />
              <button type="submit" disabled={!newCat.trim()}>{t('addCategory')}</button>
            </form>
          ) : (
            <button class="link" onClick={() => setAddingCat(true)}>{t('addCategoryShort')}</button>
          )}
        </div>

        <textarea
          class="memo"
          rows={memo ? 3 : 1}
          value={memo}
          placeholder={t('memoPlaceholder')}
          aria-label={t('memo')}
          onInput={(e) => onMemoInput((e.target as HTMLTextAreaElement).value)}
          onBlur={flushMemo}
        />
      </header>

      <div class="tabs" role="tablist" aria-label={t('detailTabs')}>
        <button role="tab" aria-selected={tab === 'body'} onClick={() => chooseTab('body')}>
          {t('tabBody')} <span class="tab-count">{frags.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'ai'} onClick={() => chooseTab('ai')}>
          ✦ AI <span class="tab-count">{scrap.aiAnswerCount}</span>
        </button>
      </div>

      {tab === 'body' && (
        <div role="tabpanel">
          <Snapshots scrapId={scrapId} />
          {frags.length === 0 && <p class="empty">{t('noFragments')}</p>}
          <ul class="frags">
            {frags.map((f) => (
              <li key={f.id} class={`frag frag-${f.source}`}>
                <div class="frag-head">
                  <span class="frag-label">{fragLabel(f.fieldLabel)}</span>
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
                  <p class="frag-extras">
                    {f.extras?.map((x) => (
                      <span key={x.label}>{fragLabel(x.label)}: {x.text}</span>
                    ))}
                    {f.permalink && (
                      <a href={f.permalink} target="_blank" rel="noreferrer noopener">{t('openPage')}</a>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'ai' && (
        <div role="tabpanel">
          <AiPanel scrap={scrap} frags={frags} />
        </div>
      )}
    </article>
  );
}
