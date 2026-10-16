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
import { DetailView } from '@/ui/DetailView';
import { FilterPanel, SearchBox } from '@/ui/Filters';
import { formatBytes } from '@/ui/format';
import { useCategories, useListData, useLive } from '@/ui/hooks';
import { ScrapList } from '@/ui/ListBrowser';
import { SiteSettings } from '@/ui/SiteSettings';

type Section = 'library' | 'categories' | 'sites' | 'settings';
const SECTIONS: Section[] = ['library', 'categories', 'sites', 'settings'];

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
        <h1>ScrapAI</h1>
        <nav class="m-nav" aria-label="ScrapAI">
          {SECTIONS.map((s) => (
            <button key={s} aria-current={section === s ? 'page' : undefined} onClick={() => setSection(s)}>
              {t(s === 'library' ? 'navLibrary' : s === 'categories' ? 'navCategories' : s === 'sites' ? 'navSites' : 'navSettings')}
            </button>
          ))}
        </nav>
        {section === 'library' && (
          <FilterPanel
            params={params}
            onChange={(p) => {
              setParams(p);
              setSelection(new Set());
            }}
            domains={data?.domains ?? []}
            categories={categories}
          />
        )}
      </aside>

      <main class="m-main">
        {section === 'library' && (
          <Library
            settings={settings}
            params={params}
            setParams={(p) => {
              setParams(p);
              setSelection(new Set());
            }}
            data={data}
            categories={categories}
            activeId={activeId}
            setActiveId={setActiveId}
            selection={selection}
            toggleSelect={toggleSelect}
            clearSelection={() => setSelection(new Set())}
            selectAll={() => setSelection(new Set(data?.items.map((s) => s.id) ?? []))}
            onDensity={(listStyle) => updateSettings({ listStyle })}
          />
        )}
        {section === 'categories' && <CategoryManager categories={categories} />}
        {section === 'sites' && <SiteSettings />}
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
}) {
  const { selection, params } = props;
  const ids = [...selection];
  const archivedView = params.view === 'archived';

  async function bulk(fn: (ids: string[]) => Promise<void>) {
    await fn(ids);
    props.clearSelection();
  }

  return (
    <>
      <div class="m-toolbar">
        <SearchBox value={params.q} onInput={(q) => props.setParams({ ...params, q })} />
        <button onClick={props.selectAll}>{t('selectAll')}</button>
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
          {archivedView && (
            <button
              class="danger"
              onClick={async () => {
                if (!window.confirm(t('confirmBulkDelete', selection.size))) return;
                await bulk(deleteScraps);
                if (props.activeId && selection.has(props.activeId)) props.setActiveId(null);
              }}
            >
              {t('deleteForever')}
            </button>
          )}
        </div>
      )}

      <ScrapList
        data={props.data}
        params={params}
        categories={props.categories}
        density={props.settings.listStyle}
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

      <div>
        <h3>{t('settingsData')}</h3>
        <p>{t('localOnlyLong')}</p>
        <p class="muted">{t('storageUsage', usage)}</p>
      </div>
    </section>
  );
}
