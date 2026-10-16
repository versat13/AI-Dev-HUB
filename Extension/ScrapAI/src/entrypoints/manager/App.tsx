import { browser } from 'wxt/browser';
import { useEffect, useState } from 'preact/hooks';
import {
  archiveScraps,
  createCategory,
  db,
  deleteCategory,
  deleteScraps,
  moveCategory,
  renameCategory,
  restoreScraps,
  setCategoryOn,
} from '@/lib/db';
import { t } from '@/lib/i18n';
import { DEFAULT_PARAMS, type ListParams } from '@/lib/query';
import { setSettings } from '@/lib/settings';
import type { Category, Settings } from '@/lib/types';
import { applyLocale } from '@/ui/boot';
import { DataSettings } from '@/ui/DataSettings';
import { DetailView } from '@/ui/DetailView';
import { ActiveFilters, FilterPanel, SearchBox, SortSelect } from '@/ui/Filters';
import { ConfirmDelete } from '@/ui/ConfirmDelete';
import { Icon } from '@/ui/icons';
import { formatBytes } from '@/ui/format';
import { useCategories, useListData, useLive } from '@/ui/hooks';
import { ScrapList } from '@/ui/ListBrowser';
import { SiteSettings } from '@/ui/SiteSettings';
import { TemplateSettings } from '@/ui/TemplateSettings';

type Section = 'library' | 'categories' | 'sites' | 'templates' | 'settings';
const SECTIONS: Section[] = ['library', 'categories', 'sites', 'templates', 'settings'];

const NAV_LABEL: Record<Section, string> = {
  library: 'navLibrary',
  categories: 'navCategories',
  sites: 'navSites',
  templates: 'navTemplates',
  settings: 'navSettings',
};

function sectionFromHash(): Section | null {
  const m = location.hash.match(/section=(\w+)/);
  return SECTIONS.find((s) => s === m?.[1]) ?? null;
}

function scrapIdFromHash(): string | null {
  const m = location.hash.match(/scrap=([^&]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export function App({ initial }: { initial: Settings }) {
  const [settings, setSettingsState] = useState(initial);
  const [section, setSection] = useState<Section>(sectionFromHash() ?? 'library');
  const [activeId, setActiveId] = useState<string | null>(scrapIdFromHash());
  const [params, setParams] = useState<ListParams>({ ...DEFAULT_PARAMS, pinnedFirst: initial.pinnedFirst });
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const categories = useCategories();
  const data = useListData(params);
  const changeParams = (p: ListParams) => {
    setParams(p);
    setSelection(new Set());
  };
  // サイドバーの件数（アーカイブ以外をカテゴリ別に数える）
  const counts =
    useLive(async () => {
      let active = 0;
      let archived = 0;
      const byCat = new Map<string, number>();
      await db.scraps.each((s) => {
        if (s.archivedAt != null) return void archived++;
        active++;
        s.categoryIds.forEach((c) => byCat.set(c, (byCat.get(c) ?? 0) + 1));
      });
      return { active, archived, byCat };
    }, []) ?? { active: 0, archived: 0, byCat: new Map<string, number>() };

  // ポップアップなどから #scrap=<id> 付きで開かれたとき
  useEffect(() => {
    const onHash = () => {
      const id = scrapIdFromHash();
      if (id) {
        setActiveId(id);
        setSection('library');
      }
      const sec = sectionFromHash();
      if (sec) setSection(sec);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  async function updateSettings(patch: Partial<Settings>) {
    const next = await setSettings(patch);
    applyLocale(next);
    setSettingsState(next);
    if (patch.pinnedFirst !== undefined) setParams((p) => ({ ...p, pinnedFirst: next.pinnedFirst }));
  }

  const toggleSelect = (id: string) =>
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const showDetail = section === 'library' && activeId != null;
  const layout = section === 'library' ? (showDetail ? 'manager' : 'manager no-detail') : 'manager single';

  return (
    <div class={layout}>
      <aside class="m-side">
        <h1 class="brand"><img src="/icon/32.png" width="20" height="20" alt="" />ScrapAI</h1>
        <nav class="m-nav" aria-label="ScrapAI">
          <button
            aria-current={section === 'library' && params.view !== 'archived' ? 'page' : undefined}
            onClick={() => {
              setSection('library');
              changeParams({ ...params, view: 'active' });
            }}
          >
            {t('navLibrary')}
            <span class="nav-count">{counts.active}</span>
          </button>
          <button
            aria-current={section === 'library' && params.view === 'archived' ? 'page' : undefined}
            onClick={() => {
              setSection('library');
              changeParams({ ...params, view: 'archived' });
            }}
          >
            {t('viewArchived')}
            <span class="nav-count">{counts.archived}</span>
          </button>
        </nav>

        {categories.length > 0 && (
          <nav class="m-cats" aria-label={t('categories')}>
            <h2>{t('categories')}</h2>
            {categories.map((c) => (
              <button
                key={c.id}
                aria-current={section === 'library' && params.category === c.id ? 'true' : undefined}
                onClick={() => {
                  setSection('library');
                  changeParams({ ...params, category: params.category === c.id ? 'any' : c.id });
                }}
              >
                {c.name}
                <span class="nav-count">{counts.byCat.get(c.id) ?? 0}</span>
              </button>
            ))}
          </nav>
        )}

        <nav class="m-nav m-tools" aria-label={t('navSettings')}>
          {SECTIONS.filter((s) => s !== 'library').map((s) => (
            <button key={s} aria-current={section === s ? 'page' : undefined} onClick={() => setSection(s)}>
              {t(NAV_LABEL[s])}
            </button>
          ))}
        </nav>
      </aside>

      <main class="m-main">
        {section === 'library' && (
          <Library
            settings={settings}
            params={params}
            setParams={changeParams}
            data={data}
            categories={categories}
            activeId={activeId}
            setActiveId={setActiveId}
            selection={selection}
            toggleSelect={toggleSelect}
            clearSelection={() => setSelection(new Set())}
            selectAll={() => setSelection(new Set(data?.items.map((s) => s.id) ?? []))}
            onDensity={(listStyle) => updateSettings({ listStyle })}
            onColumns={(cardColumns) => updateSettings({ cardColumns })}
          />
        )}
        {section === 'categories' && <CategoryManager categories={categories} />}
        {section === 'sites' && <SiteSettings />}
        {section === 'templates' && <TemplateSettings />}
        {section === 'settings' && <SettingsPane settings={settings} onChange={updateSettings} />}
      </main>

      {showDetail && (
        <aside class="m-detail">
          <DetailView
            key={activeId!}
            scrapId={activeId!}
            closeLabel={t('close')}
            onClose={() => setActiveId(null)}
            onOpenOther={(id) => setActiveId(id)}
          />
        </aside>
      )}
    </div>
  );
}

function Library(props: {
  settings: Settings;
  params: ListParams;
  setParams: (p: ListParams) => void;
  data: ReturnType<typeof useListData>;
  categories: Category[];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  selection: Set<string>;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  onDensity: (d: Settings['listStyle']) => void;
  onColumns: (n: number) => void;
}) {
  const { selection, params } = props;
  const ids = [...selection];
  const [filtersOpen, setFiltersOpen] = useState(false);

  async function bulk(fn: (ids: string[]) => Promise<void>) {
    await fn(ids);
    props.clearSelection();
  }

  return (
    <>
      <div class="m-toolbar">
        <SearchBox value={params.q} onInput={(q) => props.setParams({ ...params, q })} />
        <button
          class={`toggle${filtersOpen ? ' on' : ''}`}
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <Icon name="filter" size={14} /> {t('filters')}
        </button>
        <SortSelect value={params.sort} onChange={(sort) => props.setParams({ ...params, sort })} />
        <span class="spacer" />
        <div role="group" aria-label={`${t('densityCompact')} / ${t('densityCard')}`}>
          <button
            aria-pressed={props.settings.listStyle === 'compact'}
            onClick={() => props.onDensity('compact')}
          >
            {t('densityCompact')}
          </button>{' '}
          <button
            aria-pressed={props.settings.listStyle === 'card'}
            onClick={() => props.onDensity('card')}
          >
            {t('densityCard')}
          </button>
        </div>
        {props.settings.listStyle === 'card' && (
          <div class="columns" role="group" aria-label={t('columnsLabel')}>
            <span class="muted">{t('columnsLabel')}</span>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                aria-pressed={props.settings.cardColumns === n}
                aria-label={n === 0 ? t('columnsAuto') : t('columnsN', n)}
                onClick={() => props.onColumns(n)}
              >
                {n === 0 ? t('columnsAuto') : n}
              </button>
            ))}
          </div>
        )}
      </div>
      {filtersOpen && (
        <div class="filter-pop">
          <FilterPanel
            params={params}
            onChange={props.setParams}
            domains={props.data?.domains ?? []}
            categories={props.categories}
            hide={['view', 'category', 'sort']}
          />
        </div>
      )}
      <div class="list-head">
        <span class="count" aria-live="polite">{props.data ? t('itemCount', props.data.items.length) : ''}</span>
        <ActiveFilters params={params} onChange={props.setParams} categories={props.categories} hide={['view', 'category']} />
        <span class="spacer" />
        <button class="link" onClick={props.selectAll}>{t('selectAll')}</button>
      </div>

      {selection.size > 0 && (
        <div class="bulkbar" role="region" aria-label={t('selected', selection.size)}>
          <strong>{t('selected', selection.size)}</strong>
          <button class="link" onClick={props.clearSelection}>{t('clearSelection')}</button>
          <span class="spacer" />
          {props.categories.length > 0 && (
            <>
              <select
                aria-label={t('bulkAddCategory')}
                value=""
                onChange={async (e) => {
                  const id = (e.target as HTMLSelectElement).value;
                  if (id) await setCategoryOn(ids, id, true);
                  (e.target as HTMLSelectElement).value = '';
                }}
              >
                <option value="">{t('bulkAddCategory')}</option>
                {props.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                aria-label={t('bulkRemoveCategory')}
                value=""
                onChange={async (e) => {
                  const id = (e.target as HTMLSelectElement).value;
                  if (id) await setCategoryOn(ids, id, false);
                  (e.target as HTMLSelectElement).value = '';
                }}
              >
                <option value="">{t('bulkRemoveCategory')}</option>
                {props.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </>
          )}
          {params.view !== 'archived' && <button onClick={() => bulk(archiveScraps)}>{t('archive')}</button>}
          {params.view !== 'active' && <button onClick={() => bulk(restoreScraps)}>{t('restore')}</button>}
          <details class="menu bulk-more">
            <summary>{t('bulkMore')}</summary>
            <div class="menu-list">
              <ConfirmDelete
                label={t('bulkDelete', selection.size)}
                question={t('confirmBulkDelete', selection.size)}
                onConfirm={async () => {
                  const hadActive = props.activeId && selection.has(props.activeId);
                  await bulk(deleteScraps);
                  if (hadActive) props.setActiveId(null);
                }}
              />
            </div>
          </details>
        </div>
      )}

      <ScrapList
        data={props.data}
        params={params}
        categories={props.categories}
        density={props.settings.listStyle}
        columns={props.settings.cardColumns}
        hideCount
        activeId={props.activeId}
        selectable
        selection={selection}
        onToggleSelect={props.toggleSelect}
        onOpen={(id) => props.setActiveId(id)}
      />
    </>
  );
}

function CategoryManager({ categories }: { categories: Category[] }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const usage =
    useLive(async () => {
      const counts = new Map<string, number>();
      await db.scraps.each((s) => s.categoryIds.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1)));
      return counts;
    }, []) ?? new Map<string, number>();

  return (
    <section>
      <h2>{t('navCategories')}</h2>
      <form
        class="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await createCategory(name);
          setName('');
        }}
      >
        <input
          value={name}
          placeholder={t('categoryNamePlaceholder')}
          aria-label={t('newCategory')}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
        <button type="submit" disabled={!name.trim()}>{t('addCategory')}</button>
      </form>

      {categories.length === 0 ? (
        <p class="empty">{t('noCategories')}</p>
      ) : (
        <table class="cat-table">
          <tbody>
            {categories.map((c, i) => (
              <tr key={c.id}>
                <td>
                  {editing?.id === c.id ? (
                    <form
                      class="inline-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await renameCategory(c.id, editing.name);
                        setEditing(null);
                      }}
                    >
                      <input
                        value={editing.name}
                        aria-label={t('renameCategory')}
                        onInput={(e) => setEditing({ id: c.id, name: (e.target as HTMLInputElement).value })}
                      />
                      <button type="submit">{t('save')}</button>
                      <button type="button" onClick={() => setEditing(null)}>{t('cancel')}</button>
                    </form>
                  ) : (
                    <>
                      <strong>{c.name}</strong>{' '}
                      <span class="muted">{t('categoryUsage', usage.get(c.id) ?? 0)}</span>
                    </>
                  )}
                </td>
                <td>
                  <div class="ops">
                    <button disabled={i === 0} onClick={() => moveCategory(c.id, -1)} aria-label={`${c.name}: ${t('moveUp')}`}>
                      ↑
                    </button>
                    <button
                      disabled={i === categories.length - 1}
                      onClick={() => moveCategory(c.id, 1)}
                      aria-label={`${c.name}: ${t('moveDown')}`}
                    >
                      ↓
                    </button>
                    <button onClick={() => setEditing({ id: c.id, name: c.name })}>{t('renameCategory')}</button>
                    <button
                      class="danger"
                      onClick={async () => {
                        if (window.confirm(t('confirmDeleteCategory', c.name))) await deleteCategory(c.id);
                      }}
                    >
                      {t('deleteCategory')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function SettingsPane({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => Promise<void>;
}) {
  const [maxChars, setMaxChars] = useState(settings.articleMaxChars == null ? '' : String(settings.articleMaxChars));
  const [usage, setUsage] = useState<string>('…');

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage(formatBytes(e.usage ?? 0)));
  }, []);

  async function commitMaxChars() {
    const trimmed = maxChars.trim();
    if (trimmed === '') return onChange({ articleMaxChars: null });
    const n = Math.floor(Number(trimmed));
    if (!Number.isFinite(n) || n < 100) return setMaxChars(String(settings.articleMaxChars ?? ''));
    await onChange({ articleMaxChars: n });
  }

  return (
    <section class="settings">
      <h2>{t('navSettings')}</h2>

      <label class="block">
        <span>{t('settingsLanguage')}</span>
        <select
          value={settings.locale}
          onChange={(e) => onChange({ locale: (e.target as HTMLSelectElement).value as Settings['locale'] })}
        >
          <option value="auto">{t('langAuto')}</option>
          <option value="ja">日本語</option>
          <option value="en">English</option>
        </select>
      </label>

      <label class="block">
        <span>{t('settingsMaxChars')}</span>
        <input
          type="number"
          min={100}
          step={100}
          value={maxChars}
          placeholder="∞"
          onInput={(e) => setMaxChars((e.target as HTMLInputElement).value)}
          onBlur={commitMaxChars}
        />
        <p class="help">{t('maxCharsHelp')}</p>
      </label>

      <label class="check">
        <input
          type="checkbox"
          checked={settings.pinnedFirst}
          onChange={(e) => onChange({ pinnedFirst: (e.target as HTMLInputElement).checked })}
        />
        {t('settingsPinnedFirst')}
      </label>

      <div class="shortcuts">
        <h3>{t('settingsShortcuts')}</h3>
        <label class="check">
          <input
            type="checkbox"
            checked={settings.contextMenu}
            onChange={async (e) => {
              const box = e.target as HTMLInputElement;
              if (!box.checked) return onChange({ contextMenu: false });
              let granted = false;
              try {
                granted = await browser.permissions.request({ permissions: ['contextMenus'] });
              } catch {
                granted = false;
              }
              box.checked = granted;
              await onChange({ contextMenu: granted });
            }}
          />
          {t('settingsContextMenu')}
        </label>
        <p class="help">{t('settingsContextMenuHelp')}</p>
        <p class="help">{t('settingsShortcutsHelp')}</p>
        <button onClick={() => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
          {t('settingsShortcutsOpen')}
        </button>
      </div>

      <div>
        <h3>{t('settingsData')}</h3>
        <p>{t('localOnlyLong')}</p>
        <p class="muted">{t('storageUsage', usage)}</p>
        <DataSettings settings={settings} onApplySettings={onChange} />
      </div>
    </section>
  );
}
