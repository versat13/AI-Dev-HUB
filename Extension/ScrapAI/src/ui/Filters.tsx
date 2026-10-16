import type { ComponentChildren } from 'preact';
import { t } from '@/lib/i18n';
import { DEFAULT_PARAMS, isFiltered, type ListParams, type SortKey, type ViewMode } from '@/lib/query';
import type { Category } from '@/lib/types';

export function SearchBox({ value, onInput }: { value: string; onInput: (v: string) => void }) {
  return (
    <input
      type="search"
      class="search"
      value={value}
      placeholder={t('searchPlaceholder')}
      aria-label={t('searchPlaceholder')}
      onInput={(e) => onInput((e.target as HTMLInputElement).value)}
    />
  );
}

type FilterKey = 'view' | 'domain' | 'ai' | 'rating' | 'category' | 'sort' | 'pinned';

interface FilterPanelProps {
  params: ListParams;
  onChange: (next: ListParams) => void;
  domains: { domain: string; count: number }[];
  categories: Category[];
  hide?: FilterKey[]; // 管理タブでは、表示・カテゴリはサイドバー、並び順はツールバーにある
}

function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function FilterPanel({ params, onChange, domains, categories, hide = [] }: FilterPanelProps) {
  const show = (k: FilterKey) => !hide.includes(k);
  const set = (patch: Partial<ListParams>) => onChange({ ...params, ...patch });
  const val = (e: Event) => (e.target as HTMLSelectElement).value;

  return (
    <div class="filters">
      {show('view') && <Field label={t('labelView')}>
        <select value={params.view} onChange={(e) => set({ view: val(e) as ViewMode, domain: '' })}>
          <option value="active">{t('viewActive')}</option>
          <option value="archived">{t('viewArchived')}</option>
          <option value="all">{t('viewAll')}</option>
        </select>
      </Field>}

      <Field label={t('labelDomain')}>
        <select value={params.domain} onChange={(e) => set({ domain: val(e) })}>
          <option value="">{t('optAllDomains')}</option>
          {domains.map((d) => (
            <option key={d.domain} value={d.domain}>
              {d.domain} ({d.count})
            </option>
          ))}
        </select>
      </Field>

      <Field label={t('labelAi')}>
        <select value={params.ai} onChange={(e) => set({ ai: val(e) as ListParams['ai'] })}>
          <option value="any">{t('optAny')}</option>
          <option value="none">{t('aiNone')}</option>
          <option value="has">{t('aiYes', '≥1')}</option>
        </select>
      </Field>

      <Field label={t('labelRating')}>
        <select
          value={String(params.rating)}
          onChange={(e) => {
            const v = val(e);
            set({ rating: v === 'any' || v === 'unrated' ? v : (Number(v) as ListParams['rating']) });
          }}
        >
          <option value="any">{t('optAny')}</option>
          <option value="unrated">{t('ratingUnrated')}</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>{t('ratingMin', n)}</option>
          ))}
        </select>
      </Field>

      {show('category') && <Field label={t('labelCategory')}>
        <select value={params.category} onChange={(e) => set({ category: val(e) })}>
          <option value="any">{t('optAny')}</option>
          <option value="none">{t('categoryNone')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>}

      {show('sort') && <SortSelect value={params.sort} onChange={(sort) => set({ sort })} labelled />}

      <label class="check">
        <input
          type="checkbox"
          checked={params.pinnedOnly}
          onChange={(e) => set({ pinnedOnly: (e.target as HTMLInputElement).checked })}
        />
        {t('pinnedOnly')}
      </label>

    </div>
  );
}

export function SortSelect({ value, onChange, labelled }: { value: SortKey; onChange: (v: SortKey) => void; labelled?: boolean }) {
  const sel = (
    <select
      value={value}
      aria-label={labelled ? undefined : t('labelSort')}
      onChange={(e) => onChange((e.target as HTMLSelectElement).value as SortKey)}
    >
      <option value="created-desc">{t('sortCreatedDesc')}</option>
      <option value="created-asc">{t('sortCreatedAsc')}</option>
      <option value="updated-desc">{t('sortUpdatedDesc')}</option>
      <option value="stars-desc">{t('sortStars')}</option>
      <option value="title-asc">{t('sortTitle')}</option>
      <option value="domain-asc">{t('sortDomain')}</option>
    </select>
  );
  return labelled ? <Field label={t('labelSort')}>{sel}</Field> : sel;
}

/** 有効な絞り込み条件だけをチップで並べる。× で個別に解除できる */
export function ActiveFilters({ params, onChange, categories, hide = [] }: {
  params: ListParams;
  onChange: (next: ListParams) => void;
  categories: Category[];
  hide?: ('view' | 'category')[]; // 管理タブではサイドバーで分かるので出さない
}) {
  if (!isFiltered(params)) return null;
  const chips: { key: string; label: string; clear: Partial<ListParams> }[] = [];
  if (!hide.includes('view')) {
    if (params.view === 'archived') chips.push({ key: 'view', label: t('viewArchived'), clear: { view: 'active' } });
    if (params.view === 'all') chips.push({ key: 'view', label: t('viewAll'), clear: { view: 'active' } });
  }
  if (params.category !== 'any' && !hide.includes('category')) {
    const name = params.category === 'none' ? t('categoryNone') : categories.find((c) => c.id === params.category)?.name ?? '?';
    chips.push({ key: 'cat', label: name, clear: { category: 'any' } });
  }
  if (params.domain) chips.push({ key: 'domain', label: params.domain, clear: { domain: '' } });
  if (params.ai === 'has') chips.push({ key: 'ai', label: t('filterAiHas'), clear: { ai: 'any' } });
  if (params.ai === 'none') chips.push({ key: 'ai', label: t('aiNone'), clear: { ai: 'any' } });
  if (params.rating === 'unrated') chips.push({ key: 'rating', label: t('ratingUnrated'), clear: { rating: 'any' } });
  else if (params.rating !== 'any') chips.push({ key: 'rating', label: t('ratingMin', params.rating), clear: { rating: 'any' } });
  if (params.pinnedOnly) chips.push({ key: 'pin', label: t('pinnedOnly'), clear: { pinnedOnly: false } });

  return (
    <div class="active-filters" role="group" aria-label={t('filters')}>
      {chips.map((c) => (
        <span key={c.key} class="fchip">
          {c.label}
          <button aria-label={t('filterRemove', c.label)} onClick={() => onChange({ ...params, ...c.clear })}>×</button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          class="link"
          onClick={() => onChange({ ...DEFAULT_PARAMS, q: params.q, sort: params.sort, pinnedFirst: params.pinnedFirst })}
        >
          {t('filterReset')}
        </button>
      )}
    </div>
  );
}
