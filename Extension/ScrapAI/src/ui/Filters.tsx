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

interface FilterPanelProps {
  params: ListParams;
  onChange: (next: ListParams) => void;
  domains: { domain: string; count: number }[];
  categories: Category[];
}

function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function FilterPanel({ params, onChange, domains, categories }: FilterPanelProps) {
  const set = (patch: Partial<ListParams>) => onChange({ ...params, ...patch });
  const val = (e: Event) => (e.target as HTMLSelectElement).value;

  return (
    <div class="filters">
      <Field label={t('labelView')}>
        <select value={params.view} onChange={(e) => set({ view: val(e) as ViewMode, domain: '' })}>
          <option value="active">{t('viewActive')}</option>
          <option value="archived">{t('viewArchived')}</option>
          <option value="all">{t('viewAll')}</option>
        </select>
      </Field>

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

      <Field label={t('labelCategory')}>
        <select value={params.category} onChange={(e) => set({ category: val(e) })}>
          <option value="any">{t('optAny')}</option>
          <option value="none">{t('categoryNone')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>

      <Field label={t('labelSort')}>
        <select value={params.sort} onChange={(e) => set({ sort: val(e) as SortKey })}>
          <option value="created-desc">{t('sortCreatedDesc')}</option>
          <option value="created-asc">{t('sortCreatedAsc')}</option>
          <option value="updated-desc">{t('sortUpdatedDesc')}</option>
          <option value="stars-desc">{t('sortStars')}</option>
          <option value="title-asc">{t('sortTitle')}</option>
        </select>
      </Field>

      <label class="check">
        <input
          type="checkbox"
          checked={params.pinnedOnly}
          onChange={(e) => set({ pinnedOnly: (e.target as HTMLInputElement).checked })}
        />
        {t('pinnedOnly')}
      </label>

      {isFiltered(params) && (
        <button
          class="link"
          onClick={() =>
            onChange({ ...DEFAULT_PARAMS, q: params.q, sort: params.sort, pinnedFirst: params.pinnedFirst })
          }
        >
          {t('filterReset')}
        </button>
      )}
    </div>
  );
}
