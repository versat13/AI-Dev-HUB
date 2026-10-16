import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { archiveScraps, deleteScraps, restoreScraps, setCategoryOn, setPinnedOn, setStarsOn } from '@/lib/db';
import { t } from '@/lib/i18n';
import type { ViewMode } from '@/lib/query';
import { deleteSnapshotsOf } from '@/lib/snapshot';
import type { Category, Scrap } from '@/lib/types';
import { ConfirmDelete } from './ConfirmDelete';
import { Icon } from './icons';

/** ボタンから開く小さなメニュー。外をクリックするか Esc で閉じる */
function Popover(props: { icon: string; label: string; disabled?: boolean; children: (close: () => void) => ComponentChildren }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  useEffect(() => {
    if (props.disabled) setOpen(false);
  }, [props.disabled]);
  return (
    <span class="pop" ref={box}>
      <button class="bulk-btn" disabled={props.disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name={props.icon} size={15} />
        <span class="bulk-label">{props.label}</span>
        <span class="caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div class="pop-list" role="menu">
          {props.children(() => setOpen(false))}
        </div>
      )}
    </span>
  );
}

/**
 * 一覧の操作バー（Gmail のように常に出す）。左: 全選択のチェック・件数・選択の操作、
 * 中: 選んだ項目への操作（アイコン+短い名前）。何も選んでいないときは操作が薄くなる。
 */
export function BulkBar(props: {
  items: Scrap[]; // 絞り込み後の全件
  pageIds: string[]; // 今のページに出ている項目
  selection: Set<string>;
  categories: Category[];
  view: ViewMode;
  activeId: string | null;
  onSelectPage: () => void;
  onClear: () => void;
  onActiveGone: () => void;
}) {
  const { selection } = props;
  const sel = props.items.filter((s) => selection.has(s.id));
  const ids = sel.map((s) => s.id);
  const none = ids.length === 0;
  const pageSelected = props.pageIds.filter((id) => selection.has(id)).length;
  const check = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (check.current) check.current.indeterminate = pageSelected > 0 && pageSelected < props.pageIds.length;
  }, [pageSelected, props.pageIds.length]);
  const allPinned = sel.length > 0 && sel.every((s) => s.pinned);

  const done = async (fn: () => Promise<void>, clear = false) => {
    await fn();
    if (clear) props.onClear();
  };

  return (
    <div class={`bulkbar${none ? ' idle' : ''}`} role="toolbar" aria-label={none ? t('bulkHint') : t('selected', ids.length)}>
      <input
        ref={check}
        type="checkbox"
        class="bulk-check"
        aria-label={t('selectAll')}
        checked={props.pageIds.length > 0 && pageSelected === props.pageIds.length}
        onChange={() => (pageSelected === props.pageIds.length ? props.onClear() : props.onSelectPage())}
      />
      <button class="link" onClick={props.onSelectPage} disabled={props.pageIds.length === 0}>{t('selectAll')}</button>
      <button class="link" onClick={props.onClear} disabled={none}>{t('clearSelection')}</button>
      <strong class="bulk-count" aria-live="polite">{none ? '' : t('selected', ids.length)}</strong>
      <span class="bulk-sep" aria-hidden="true" />

      <Popover icon="tag" label={t('bulkCategory')} disabled={none}>
        {() =>
          props.categories.length === 0 ? (
            <p class="pop-empty">{t('categoryNone')}</p>
          ) : (
            props.categories.map((c) => {
              const n = sel.filter((s) => s.categoryIds.includes(c.id)).length;
              const state = n === 0 ? 'none' : n === sel.length ? 'all' : 'some';
              return (
                <button key={c.id} role="menuitemcheckbox" aria-checked={state === 'all' ? 'true' : state === 'some' ? 'mixed' : 'false'} onClick={() => setCategoryOn(ids, c.id, state !== 'all')}>
                  <span class="tick">{state === 'all' ? '✓' : state === 'some' ? '–' : ''}</span>
                  {c.name}
                </button>
              );
            })
          )
        }
      </Popover>

      <Popover icon="star" label={t('bulkRating')} disabled={none}>
        {(close) => (
          <>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} role="menuitem" aria-label={t('starLabel', n)} onClick={() => void setStarsOn(ids, n).then(close)}>
                <span class="stars-on">{'★'.repeat(n)}</span>
                <span class="stars-off">{'★'.repeat(5 - n)}</span>
              </button>
            ))}
            <hr />
            <button role="menuitem" onClick={() => void setStarsOn(ids, null).then(close)}>{t('bulkRatingClear')}</button>
          </>
        )}
      </Popover>

      <button class="bulk-btn" disabled={none} aria-pressed={allPinned} onClick={() => void setPinnedOn(ids, !allPinned)}>
        <Icon name="pin" size={15} />
        <span class="bulk-label">{allPinned ? t('bulkUnpin') : t('bulkPin')}</span>
      </button>

      {props.view !== 'archived' && (
        <button class="bulk-btn" disabled={none} onClick={() => void done(() => archiveScraps(ids), true)}>
          <Icon name="archive" size={15} />
          <span class="bulk-label">{t('archive')}</span>
        </button>
      )}
      {props.view !== 'active' && (
        <button class="bulk-btn" disabled={none} onClick={() => void done(() => restoreScraps(ids), true)}>
          <Icon name="undo" size={15} />
          <span class="bulk-label">{t('restore')}</span>
        </button>
      )}

      <Popover icon="more" label={t('bulkMore')} disabled={none}>
        {() => (
          <>
            <ConfirmDelete label={t('bulkDeleteSnapshots', ids.length)} onConfirm={() => deleteSnapshotsOf(ids)} />
            <hr />
            <ConfirmDelete
              label={t('bulkDelete', ids.length)}
              onConfirm={async () => {
                const hadActive = props.activeId && selection.has(props.activeId);
                await done(() => deleteScraps(ids), true);
                if (hadActive) props.onActiveGone();
              }}
            />
          </>
        )}
      </Popover>
    </div>
  );
}
