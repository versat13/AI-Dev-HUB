import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { t } from '@/lib/i18n';
import type { ListData } from '@/lib/list';
import { DEFAULT_PARAMS, isFiltered, type ListParams } from '@/lib/query';
import { db } from '@/lib/db';
import { bodyFragment } from '@/lib/text';
import type { Category, Density, Settings } from '@/lib/types';
import { ActiveFilters, FilterPanel, SearchBox } from './Filters';
import { Icon } from './icons';
import { setSettings } from '@/lib/settings';
import { useAiJobs, useCategories, useListData, useLive, useThumbs } from './hooks';
import { useAiRun } from './ai-run-ui';
import { Pager, pageSlice } from './Pager';
import { MAX_CATS, ScrapRow } from './ScrapRow';

/** ポップアップ・サイドパネルの1ページの件数（上限） */
export const BROWSER_PAGE_SIZE = 50;

/** 一覧の本体（件数・空表示・行）。選択UIが要る管理タブでも使う */
export function ScrapList(props: {
  data: ListData | undefined;
  params: ListParams;
  categories: Category[];
  density: Density;
  columns?: number;
  aiRun?: (id: string) => void; // AIボタンを出す（ポップアップ・サイドパネル）
  showSnapshots?: boolean; // カードにスナップショットを小さく出す（カード・カード（大）のみ）
  hideCount?: boolean; // 件数を呼び出し側で出す（管理タブ）
  face?: Settings['listFace']; // カード表示の列数（0または未指定 = 1列。管理タブでのみ指定する）
  activeId?: string | null;
  selectable?: boolean;
  selection?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { data, params } = props;
  // カード（大）では、AI要約を出さないカードに最初の断片の冒頭を長めに出す（表示の切り替えに関係なく）
  const wantPreview = props.density === 'large';
  const ids = data?.items.map((s) => s.id).join(',') ?? '';
  const previews = useLive(async () => {
    if (!wantPreview || !ids) return null;
    const frags = (await db.fragments.where('scrapId').anyOf(ids.split(',')).toArray()).sort((a, b) => a.order - b.order);
    const by = new Map<string, typeof frags>();
    for (const f of frags) by.set(f.scrapId, [...(by.get(f.scrapId) ?? []), f]);
    // 本文にあたる断片（タイトルだけの断片は飛ばす）の冒頭
    return new Map([...by].map(([k, list]) => [k, (bodyFragment(list, true)?.text ?? '').replace(/\s+/g, ' ').slice(0, 600)]));
  }, [wantPreview, ids]);
  const jobs = useAiJobs();
  const thumbs = useThumbs(props.showSnapshots && props.density !== 'compact' ? ids : '');
  if (!data) return <p class="empty" role="status">…</p>;
  // ドメインの欄は、表示中で最も長いドメインに幅を合わせる（カードごとに位置がずれないように）
  const domW = Math.min(24, Math.max(6, ...data.items.map((s) => s.domain.length)));
  // カテゴリの欄も、表示中で最も長いものに幅を合わせる（星の位置をそろえるため）。全角は2文字分で数える
  const catMap0 = new Map(props.categories.map((c) => [c.id, c.name]));
  const wide = (x: string) => [...x].reduce((n, ch) => n + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0);
  const catW = Math.min(
    30,
    Math.max(
      0,
      ...data.items.map((s) => {
        const names = s.categoryIds.map((id) => catMap0.get(id)).filter((x): x is string => !!x);
        const shown = names.slice(0, MAX_CATS).map((n) => Math.min(12, wide(n)) + 3);
        return shown.reduce((a, b) => a + b, 0) + (names.length > MAX_CATS ? 5 : 0);
      }),
    ),
  );

  const catMap = new Map(props.categories.map((c) => [c.id, c]));
  let empty: string | null = null;
  if (data.items.length === 0) {
    if (data.total === 0) empty = t('emptyList');
    else if (params.view === 'archived' && !params.q && !isFiltered({ ...params, view: 'active' })) empty = t('emptyArchived');
    else empty = t('emptyFiltered');
  }

  return (
    <>
      {!props.hideCount && <p class="count" aria-live="polite">{t('itemCount', data.items.length)}</p>}
      {empty ? (
        <p class="empty">{empty}</p>
      ) : (
        <ul
          data-density={props.density}
          class={`rows${props.density !== 'compact' && props.columns != null ? ' grid' : ''}`}
          style={{
            '--dom-w': `${domW}ch`,
            '--cat-w': `${catW}ch`,
            ...(props.density !== 'compact' && props.columns != null
              ? {
                  gridTemplateColumns:
                    props.columns > 0
                      ? `repeat(${props.columns}, minmax(0, 1fr))`
                      : `repeat(auto-fill, minmax(${props.density === 'large' ? 320 : 240}px, 1fr))`,
                }
              : {}),
          }}
        >
          {data.items.map((s) => (
            <ScrapRow
              key={s.id}
              scrap={s}
              categories={catMap}
              density={props.density}
              face={props.face}
              preview={previews?.get(s.id)}
              thumb={thumbs.get(s.id)}
              aiRun={props.aiRun ? { job: jobs[s.id], onRun: props.aiRun } : undefined}
              active={props.activeId === s.id}
              selectable={props.selectable}
              selected={props.selection?.has(s.id)}
              onToggleSelect={props.onToggleSelect}
              onOpen={props.onOpen}
            />
          ))}
        </ul>
      )}
    </>
  );
}

/** ポップアップ／サイドパネル用: 検索欄 + 折りたたみ式の絞り込み + 一覧 */
export function ListBrowser(props: {
  settings: Settings;
  barExtra?: ComponentChildren; // 検索欄の右に並べるボタン（サイドパネル）
  onOpen: (id: string) => void;
  activeId?: string | null;
}) {
  const [params, setParams0] = useState<ListParams>({
    ...DEFAULT_PARAMS,
    pinnedFirst: props.settings.pinnedFirst,
  });
  const [page, setPage] = useState(1);
  // 検索・絞り込みを変えたら1ページ目に戻す
  const setParams = (p: ListParams) => {
    setParams0(p);
    setPage(1);
  };
  const [showFilters, setShowFilters] = useState(false);
  const [face, setFace] = useState<Settings['listFace']>(props.settings.listFace);
  const categories = useCategories();
  const runAi = useAiRun();
  const data = useListData(params);
  const paged = pageSlice(data?.items ?? [], page, BROWSER_PAGE_SIZE);
  const shown = data ? { ...data, items: paged.items } : undefined;

  return (
    <section class="browser">
      {/* 検索・絞り込み・表示の切り替えを1行に。件数は検索欄の右端に小さく出す */}
      <div class="browser-bar">
        <div class="search-wrap">
          <SearchBox value={params.q} onInput={(q) => setParams({ ...params, q })} />
          {data && <span class="search-count" aria-live="polite">{t('itemCount', data.items.length)}</span>}
        </div>
        <button
          class={`toggle icon-btn${isFiltered(params) ? ' on' : ''}`}
          aria-expanded={showFilters}
          aria-label={t('filters')}
          title={t('filters')}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Icon name="filter" />
        </button>
        <FaceToggle
          compact
          value={face}
          onChange={(v) => {
            setFace(v);
            void setSettings({ listFace: v });
          }}
        />
        {props.barExtra}
      </div>
      <ActiveFilters params={params} onChange={setParams} categories={categories} />
      {showFilters && (
        <FilterPanel
          params={params}
          onChange={setParams}
          domains={data?.domains ?? []}
          categories={categories}
        />
      )}
      <div class="browser-list">
        <ScrapList
          data={shown}
          params={params}
          categories={categories}
          density="compact"
          face={face}
          hideCount
          aiRun={runAi}
          activeId={props.activeId}
          onOpen={props.onOpen}
        />
      </div>
      <Pager compact page={paged.page} pages={paged.pages} onPage={setPage} />
    </section>
  );
}

/** 一覧全体の表示切り替え: AI要約を主役にするか、元の内容（切り抜いたもの）か */
export function FaceToggle({ value, onChange, compact }: { value: Settings['listFace']; onChange: (v: Settings['listFace']) => void; compact?: boolean }) {
  return (
    <div class="seg face-toggle" role="group" aria-label={t('listFace')}>
      <button aria-pressed={value === 'ai'} aria-label={t('faceAi')} onClick={() => onChange('ai')}>✦ {compact ? 'AI' : t('faceAi')}</button>
      <button aria-pressed={value === 'original'} onClick={() => onChange('original')}>{t('faceOriginal')}</button>
    </div>
  );
}
