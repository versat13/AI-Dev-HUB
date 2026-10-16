import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { t } from '@/lib/i18n';
import type { ListData } from '@/lib/list';
import { DEFAULT_PARAMS, isFiltered, type ListParams } from '@/lib/query';
import { db } from '@/lib/db';
import type { Category, Density, Settings } from '@/lib/types';
import { ActiveFilters, FilterPanel, SearchBox } from './Filters';
import { Icon } from './icons';
import { setSettings } from '@/lib/settings';
import { useCategories, useListData, useLive } from './hooks';
import { ScrapRow } from './ScrapRow';

/** 一覧の本体（件数・空表示・行）。選択UIが要る管理タブでも使う */
export function ScrapList(props: {
  data: ListData | undefined;
  params: ListParams;
  categories: Category[];
  density: Density;
  columns?: number;
  hideCount?: boolean; // 件数を呼び出し側で出す（管理タブ）
  face?: Settings['listFace']; // カード表示の列数（0または未指定 = 1列。管理タブでのみ指定する）
  activeId?: string | null;
  selectable?: boolean;
  selection?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { data, params } = props;
  // カード（大）の「原文」表示では、最初の断片の冒頭を長めに出す
  const wantPreview = props.density === 'large' && props.face === 'original';
  const ids = data?.items.map((s) => s.id).join(',') ?? '';
  const previews = useLive(async () => {
    if (!wantPreview || !ids) return null;
    const frags = await db.fragments.where('scrapId').anyOf(ids.split(',')).toArray();
    const first = new Map<string, { order: number; text: string }>();
    for (const f of frags) {
      const cur = first.get(f.scrapId);
      if (!cur || f.order < cur.order) first.set(f.scrapId, { order: f.order, text: f.text });
    }
    return new Map([...first].map(([k, v]) => [k, v.text.replace(/\s+/g, ' ').slice(0, 600)]));
  }, [wantPreview, ids]);
  if (!data) return <p class="empty" role="status">…</p>;
  // ドメインの欄は、表示中で最も長いドメインに幅を合わせる（カードごとに位置がずれないように）
  const domW = Math.min(24, Math.max(6, ...data.items.map((s) => s.domain.length)));

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
  const [params, setParams] = useState<ListParams>({
    ...DEFAULT_PARAMS,
    pinnedFirst: props.settings.pinnedFirst,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [face, setFace] = useState<Settings['listFace']>(props.settings.listFace);
  const categories = useCategories();
  const data = useListData(params);

  return (
    <section class="browser">
      <div class="browser-bar">
        <SearchBox value={params.q} onInput={(q) => setParams({ ...params, q })} />
        <button
          class={`toggle icon-btn${isFiltered(params) ? ' on' : ''}`}
          aria-expanded={showFilters}
          aria-label={t('filters')}
          title={t('filters')}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Icon name="filter" />
        </button>
        {props.barExtra}
      </div>
      <div class="list-head">
        <ActiveFilters params={params} onChange={setParams} categories={categories} />
        <span class="spacer" />
        <FaceToggle
          value={face}
          onChange={(v) => {
            setFace(v);
            void setSettings({ listFace: v });
          }}
        />
      </div>
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
          data={data}
          params={params}
          categories={categories}
          density="compact"
          face={face}
          activeId={props.activeId}
          onOpen={props.onOpen}
        />
      </div>
    </section>
  );
}

/** 一覧全体の表示切り替え: AI要約を主役にするか、元の内容（切り抜いたもの）か */
export function FaceToggle({ value, onChange }: { value: Settings['listFace']; onChange: (v: Settings['listFace']) => void }) {
  return (
    <div class="seg face-toggle" role="group" aria-label={t('listFace')}>
      <button aria-pressed={value === 'ai'} onClick={() => onChange('ai')}>✦ {t('faceAi')}</button>
      <button aria-pressed={value === 'original'} onClick={() => onChange('original')}>{t('faceOriginal')}</button>
    </div>
  );
}
