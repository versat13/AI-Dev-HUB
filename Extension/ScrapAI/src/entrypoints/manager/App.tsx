import { browser } from 'wxt/browser';
import { useEffect, useState } from 'preact/hooks';
import {
  createCategory,
  db,
  deleteCategory,
  moveCategory,
  renameCategory,
} from '@/lib/db';
import { t } from '@/lib/i18n';
import { DEFAULT_PARAMS, type ListParams } from '@/lib/query';
import { setSettings } from '@/lib/settings';
import type { Category, Settings } from '@/lib/types';
import { applyLocale, applyTheme } from '@/ui/boot';
import { DataSettings } from '@/ui/DataSettings';
import { DetailView } from '@/ui/DetailView';
import { ActiveFilters, FilterPanel, SearchBox, SortSelect } from '@/ui/Filters';
import { Icon } from '@/ui/icons';
import { formatBytes } from '@/ui/format';
import { useCategories, useListData, useLive } from '@/ui/hooks';
import { FaceToggle, ScrapList } from '@/ui/ListBrowser';
import { AiSettings } from '@/ui/AiSettings';
import { BulkBar } from '@/ui/BulkBar';
import { Pager, pageSlice } from '@/ui/Pager';
import { SiteSettings } from '@/ui/SiteSettings';
import { SyncSettings, useAutoSync } from '@/ui/SyncSettings';
import { TemplateSettings } from '@/ui/TemplateSettings';

type Section = 'library' | 'categories' | 'sites' | 'templates' | 'ai' | 'sync' | 'settings';
const SECTIONS: Section[] = ['library', 'categories', 'sites', 'templates', 'ai', 'sync', 'settings'];

const NAV_LABEL: Record<Section, string> = {
  library: 'navLibrary',
  categories: 'navCategories',
  sites: 'navSites',
  templates: 'navTemplates',
  ai: 'navAi',
  sync: 'navSync',
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
  useAutoSync();
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
    applyTheme(next);
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
            selectAll={(ids) => setSelection(new Set(ids))}
            onPageSize={(pageSize) => updateSettings({ pageSize })}
            onDensity={(listStyle) => updateSettings({ listStyle })}
            onColumns={(cardColumns) => updateSettings({ cardColumns })}
            onFace={(listFace) => updateSettings({ listFace })}
            onSnapshots={(listSnapshots) => updateSettings({ listSnapshots })}
          />
        )}
        {section === 'categories' && <CategoryManager categories={categories} />}
        {section === 'sites' && <SiteSettings />}
        {section === 'templates' && <TemplateSettings />}
        {section === 'ai' && <AiSettings settings={settings} onChange={updateSettings} />}
        {section === 'sync' && <SyncSettings />}
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
  selectAll: (ids: string[]) => void;
  onPageSize: (n: number) => void;
  onDensity: (d: Settings['listStyle']) => void;
  onColumns: (n: number) => void;
  onFace: (v: Settings['listFace']) => void;
  onSnapshots: (on: boolean) => void;
}) {
  const { selection, params } = props;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const paged = pageSlice(props.data?.items ?? [], page, props.settings.pageSize);
  // 検索・絞り込み・並び替えを変えたら1ページ目に戻す
  useEffect(() => setPage(1), [JSON.stringify(params)]);
  const [sizeText, setSizeText] = useState(String(props.settings.pageSize));
  function commitSize() {
    const n = Math.floor(Number(sizeText));
    if (!Number.isFinite(n) || n < 10) return setSizeText(String(props.settings.pageSize));
    const size = Math.min(500, n);
    setSizeText(String(size));
    props.onPageSize(size);
    setPage(1);
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
        <div class="seg density" role="group" aria-label={t('densityLabel')}>
          {(['compact', 'card', 'large'] as const).map((d) => (
            <button key={d} aria-pressed={props.settings.listStyle === d} onClick={() => props.onDensity(d)}>
              {t(d === 'compact' ? 'densityCompact' : d === 'card' ? 'densityCard' : 'densityLarge')}
            </button>
          ))}
        </div>
        {props.settings.listStyle !== 'compact' && (
          <button
            class="toggle bulk-btn"
            aria-pressed={props.settings.listSnapshots}
            title={t('showSnapshotsTitle')}
            onClick={() => props.onSnapshots(!props.settings.listSnapshots)}
          >
            <Icon name="image" size={14} /> {t('showSnapshots')}
          </button>
        )}
        {props.settings.listStyle !== 'compact' && (
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
        <FaceToggle value={props.settings.listFace} onChange={(listFace) => props.onFace(listFace)} />
      </div>

      <BulkBar
        items={props.data?.items ?? []}
        pageIds={paged.items.map((s) => s.id)}
        selection={selection}
        categories={props.categories}
        view={params.view}
        activeId={props.activeId}
        onSelectPage={() => props.selectAll(paged.items.map((s) => s.id))}
        onClear={props.clearSelection}
        onActiveGone={() => props.setActiveId(null)}
      />

      <ScrapList
        data={props.data && { ...props.data, items: paged.items }}
        params={params}
        categories={props.categories}
        density={props.settings.listStyle}
        columns={props.settings.cardColumns}
        hideCount
        face={props.settings.listFace}
        activeId={props.activeId}
        selectable
        selection={selection}
        onToggleSelect={props.toggleSelect}
        showSnapshots={props.settings.listSnapshots}
        onOpen={(id) => props.setActiveId(id)}
      />
      <div class="list-foot">
        <Pager page={paged.page} pages={paged.pages} onPage={setPage} />
        <label class="page-size">
          {t('pageSizeLabel')}
          <input
            type="number"
            min={10}
            max={500}
            step={10}
            value={sizeText}
            onInput={(e) => setSizeText((e.target as HTMLInputElement).value)}
            onBlur={commitSize}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          {t('pageSizeUnit')}
        </label>
      </div>
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

      <div class="set-card">
        <h3>{t('setDisplay')}</h3>
        <label class="set-row">
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
        <label class="set-row">
          <span>{t('setTheme')}</span>
          <select value={settings.theme} onChange={(e) => onChange({ theme: (e.target as HTMLSelectElement).value as Settings['theme'] })}>
            <option value="light">{t('themeLight')}</option>
            <option value="dark">{t('themeDark')}</option>
            <option value="auto">{t('themeAuto')}</option>
          </select>
        </label>
        <label class="set-row check">
          <input
            type="checkbox"
            checked={settings.pinnedFirst}
            onChange={(e) => onChange({ pinnedFirst: (e.target as HTMLInputElement).checked })}
          />
          {t('settingsPinnedFirst')}
        </label>
        <label class="set-row check">
          <input
            type="checkbox"
            checked={settings.panelKeepOpen}
            onChange={(e) => onChange({ panelKeepOpen: (e.target as HTMLInputElement).checked })}
          />
          {t('setPanelKeepOpen')}
        </label>
        <p class="help">{t('panelKeepOpenHelp')}</p>
      </div>

      <div class="set-card">
        <h3>{t('setSaving')}</h3>
        <label class="set-row">
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
        </label>
        <p class="help">{t('maxCharsHelp')}</p>
      </div>

      <div class="set-card shortcuts">
        <h3>{t('settingsShortcuts')}</h3>
        <label class="set-row check">
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
        <div class="set-row">
          <p class="help">{t('settingsShortcutsHelp')}</p>
          <button onClick={() => void browser.tabs.create({ url: 'chrome://extensions/shortcuts' })}>
            {t('settingsShortcutsOpen')}
          </button>
        </div>
      </div>

      <div class="set-card">
        <h3>{t('settingsData')}</h3>
        <p class="help">{t('localOnlyLong')}</p>
        <p class="usage">{t('storageUsage', usage)}</p>
        <DataSettings settings={settings} onApplySettings={onChange} />
      </div>
    </section>
  );
}
