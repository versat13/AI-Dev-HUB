import { useState } from 'preact/hooks';
import { t } from '@/lib/i18n';
import type { ListData } from '@/lib/list';
import { DEFAULT_PARAMS, isFiltered, type ListParams } from '@/lib/query';
import type { Category, Settings } from '@/lib/types';
import { FilterPanel, SearchBox } from './Filters';
import { useCategories, useListData } from './hooks';
import { ScrapRow } from './ScrapRow';

/** 一覧の本体（件数・空表示・行）。選択UIが要る管理タブでも使う */
export function ScrapList(props: {
  data: ListData | undefined;
  params: ListParams;
  categories: Category[];
  density: 'compact' | 'card';
  columns?: number; // カード表示の列数（0または未指定 = 1列。管理タブでのみ指定する）
  activeId?: string | null;
  selectable?: boolean;
  selection?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { data, params } = props;
  if (!data) return <p class="empty" role="status">…</p>;

  const catMap = new Map(props.categories.map((c) => [c.id, c]));
  let empty: string | null = null;
  if (data.items.length === 0) {
    if (data.total === 0) empty = t('emptyList');
    else if (params.view === 'archived' && !params.q && !isFiltered({ ...params, view: 'active' })) empty = t('emptyArchived');
    else empty = t('emptyFiltered');
  }

  return (
    <>
      <p class="count" aria-live="polite">{t('itemCount', data.items.length)}</p>
      {empty ? (
        <p class="empty">{empty}</p>
      ) : (
        <ul
          class={`rows${props.density === 'card' && props.columns != null ? ' grid' : ''}`}
          style={
            props.density === 'card' && props.columns != null
              ? { gridTemplateColumns: props.columns > 0 ? `repeat(${props.columns}, minmax(0, 1fr))` : 'repeat(auto-fill, minmax(240px, 1fr))' }
              : undefined
          }
        >
          {data.items.map((s) => (
            <ScrapRow
              key={s.id}
              scrap={s}
              categories={catMap}
              density={props.density}
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
  onOpen: (id: string) => void;
  activeId?: string | null;
}) {
  const [params, setParams] = useState<ListParams>({
    ...DEFAULT_PARAMS,
    pinnedFirst: props.settings.pinnedFirst,
  });
  const [showFilters, setShowFilters] = useState(false);
  const categories = useCategories();
  const data = useListData(params);

  return (
    <section class="browser">
      <div class="browser-bar">
        <SearchBox value={params.q} onInput={(q) => setParams({ ...params, q })} />
        <button
          class={`toggle${isFiltered(params) ? ' on' : ''}`}
          aria-expanded={showFilters}
          onClick={() => setShowFilters(!showFilters)}
        >
          {t('filters')}
          {isFiltered(params) ? ' ●' : ''}
        </button>
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
          activeId={props.activeId}
          onOpen={props.onOpen}
        />
      </div>
    </section>
  );
}
