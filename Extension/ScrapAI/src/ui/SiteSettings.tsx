import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { ensureBuiltInProfiles, resetBuiltInProfile } from '@/lib/builtin-profiles';
import { deleteProfile, listProfiles, newProfile, saveProfile } from '@/lib/db';
import { t } from '@/lib/i18n';
import type { FieldRule, FragmentRole, SiteProfile, UnitRule } from '@/lib/types';
import { fragLabel } from './format';
import { useLive } from './hooks';
import { PENDING_PICK_KEY, type PendingPick } from './nav';

const ROLES: FragmentRole[] = ['body', 'title', 'author', 'date', 'custom'];

function newField(partial: Partial<FieldRule> = {}): FieldRule {
  return {
    id: crypto.randomUUID(),
    label: '',
    role: 'body',
    selector: '',
    match: 'first',
    maxChars: null,
    ...partial,
  };
}

function FieldsEditor(props: { fields: FieldRule[]; onChange: (f: FieldRule[]) => void }) {
  const set = (i: number, patch: Partial<FieldRule>) =>
    props.onChange(props.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div class="fields-editor">
      {props.fields.map((f, i) => (
        <div class="field-row" key={f.id}>
          <input
            aria-label={t('fieldLabel')}
            placeholder={t('fieldLabel')}
            value={fragLabel(f.label)}
            onInput={(e) => set(i, { label: (e.target as HTMLInputElement).value })}
          />
          <select
            aria-label={t('fieldRole')}
            value={f.role}
            onChange={(e) => set(i, { role: (e.target as HTMLSelectElement).value as FragmentRole })}
          >
            {ROLES.map((r) => <option key={r} value={r}>{t(`role_${r}`)}</option>)}
          </select>
          <input
            class="mono grow"
            aria-label={t('fieldSelector')}
            placeholder={t('fieldSelector')}
            value={f.selector}
            onInput={(e) => set(i, { selector: (e.target as HTMLInputElement).value })}
          />
          <input
            class="narrow"
            aria-label={t('fieldAttr')}
            placeholder={t('fieldAttr')}
            value={f.attr ?? ''}
            onInput={(e) => set(i, { attr: (e.target as HTMLInputElement).value.trim() || undefined })}
          />
          <select
            aria-label={t('fieldMatch')}
            value={f.match}
            onChange={(e) => set(i, { match: (e.target as HTMLSelectElement).value as FieldRule['match'] })}
          >
            <option value="first">{t('matchFirst')}</option>
            <option value="all">{t('matchAll')}</option>
          </select>
          <input
            class="narrow"
            type="number"
            min={1}
            aria-label={t('fieldMaxChars')}
            placeholder={t('fieldMaxChars')}
            value={f.maxChars ?? ''}
            onInput={(e) => {
              const v = (e.target as HTMLInputElement).value.trim();
              set(i, { maxChars: v === '' ? null : Math.max(1, Math.floor(Number(v)) || 1) });
            }}
          />
          <button
            class="link"
            aria-label={`${t('fieldRemove')}: ${fragLabel(f.label) || f.selector}`}
            onClick={() => props.onChange(props.fields.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button onClick={() => props.onChange([...props.fields, newField()])}>{t('fieldAdd')}</button>
    </div>
  );
}

function ProfileEditor(props: {
  draft: SiteProfile;
  setDraft: (p: SiteProfile) => void;
  onSave: () => void;
  onReset: () => void;
  onDelete: () => void;
  dirty: boolean;
}) {
  const p = props.draft;
  const patch = (x: Partial<SiteProfile>) => props.setDraft({ ...p, ...x });
  const unit = p.unit;
  const setUnit = (x: Partial<UnitRule>) => patch({ unit: { selector: '', fields: [], ...unit, ...x } });

  return (
    <section class="profile-editor">
      <label class="block">
        <span>{t('profileName')}</span>
        <input value={p.name} onInput={(e) => patch({ name: (e.target as HTMLInputElement).value })} />
      </label>
      <label class="check">
        <input
          type="checkbox"
          checked={p.enabled}
          onChange={(e) => patch({ enabled: (e.target as HTMLInputElement).checked })}
        />
        {t('profileEnabled')}
      </label>
      <label class="block">
        <span>{t('profilePatterns')}</span>
        <textarea
          rows={3}
          class="mono"
          value={p.urlPatterns.join('\n')}
          onInput={(e) =>
            patch({
              urlPatterns: (e.target as HTMLTextAreaElement).value
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean),
            })
          }
        />
        <p class="help">{t('profilePatternsHelp')}</p>
      </label>
      <label class="block narrow-block">
        <span>{t('profilePriority')}</span>
        <input
          type="number"
          value={p.priority}
          onInput={(e) => patch({ priority: Number((e.target as HTMLInputElement).value) || 0 })}
        />
      </label>

      <h3>{t('profileFields')}</h3>
      <p class="help">{t('profileFieldsHelp')}</p>
      <FieldsEditor fields={p.fields} onChange={(fields) => patch({ fields })} />

      <h3>{t('profileUnit')}</h3>
      <label class="check">
        <input
          type="checkbox"
          checked={!!unit}
          onChange={(e) =>
            patch({ unit: (e.target as HTMLInputElement).checked ? { selector: '', fields: [] } : undefined })
          }
        />
        {t('profileUnitUse')}
      </label>
      {unit && (
        <div class="unit-editor">
          <p class="help">{t('profileUnitHelp')}</p>
          <label class="block">
            <span>{t('unitSelector')}</span>
            <input class="mono" value={unit.selector} onInput={(e) => setUnit({ selector: (e.target as HTMLInputElement).value })} />
          </label>
          <label class="block">
            <span>{t('unitAnchor')}</span>
            <input
              class="mono"
              value={unit.anchorSelector ?? ''}
              onInput={(e) => setUnit({ anchorSelector: (e.target as HTMLInputElement).value.trim() || undefined })}
            />
          </label>
          <label class="block">
            <span>{t('unitPermalink')}</span>
            <input
              class="mono"
              value={unit.permalinkSelector ?? ''}
              onInput={(e) => setUnit({ permalinkSelector: (e.target as HTMLInputElement).value.trim() || undefined })}
            />
          </label>
          <FieldsEditor fields={unit.fields} onChange={(fields) => setUnit({ fields })} />
        </div>
      )}

      <h3>{t('profileSnapshot')}</h3>
      <p class="help">{t('profileSnapshotHelp')}</p>
      <div class="unit-editor">
        <label class="block narrow-block">
          <span>{t('snapMode')}</span>
          <select
            value={p.snapshot?.mode ?? 'off'}
            onChange={(e) => {
              const mode = (e.target as HTMLSelectElement).value as NonNullable<SiteProfile['snapshot']>['mode'];
              patch({ snapshot: { selector: p.unit ? '@unit' : '', ...p.snapshot, mode } });
            }}
          >
            <option value="off">{t('snapOff')}</option>
            <option value="ask">{t('snapAsk')}</option>
            <option value="auto">{t('snapAuto')}</option>
          </select>
        </label>
        {p.snapshot && p.snapshot.mode !== 'off' && (
          <>
            <label class="block">
              <span>{t('snapSelector')}</span>
              <input
                class="mono"
                value={p.snapshot.selector}
                onInput={(e) => patch({ snapshot: { ...p.snapshot!, selector: (e.target as HTMLInputElement).value } })}
              />
            </label>
            <label class="block">
              <span>{t('snapWhen')}</span>
              <input
                class="mono"
                value={p.snapshot.when ?? ''}
                onInput={(e) => patch({ snapshot: { ...p.snapshot!, when: (e.target as HTMLInputElement).value.trim() || undefined } })}
              />
            </label>
          </>
        )}
      </div>

      <div class="editor-actions">
        <button class="primary" disabled={!props.dirty || !p.name.trim()} onClick={props.onSave}>
          {t('save')}
        </button>
        {p.builtIn ? (
          <button onClick={props.onReset}>{t('profileReset')}</button>
        ) : (
          <button class="danger" onClick={props.onDelete}>{t('profileDelete')}</button>
        )}
      </div>
    </section>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function SiteSettings() {
  const profiles = useLive(listProfiles, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SiteProfile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pick, setPick] = useState<PendingPick | null>(null);

  useEffect(() => {
    void ensureBuiltInProfiles();
  }, []);

  // 要素ピッカーの選択結果を受け取る（開いた時点で残っているもの＋後から届くもの）
  useEffect(() => {
    const take = (v: unknown) => {
      const p = v as PendingPick | undefined;
      if (p && Date.now() - p.at < 10 * 60_000) setPick(p);
    };
    browser.storage.local.get(PENDING_PICK_KEY).then((r) => take(r[PENDING_PICK_KEY]));
    const on = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'local' && changes[PENDING_PICK_KEY]) take(changes[PENDING_PICK_KEY].newValue);
    };
    browser.storage.onChanged.addListener(on as never);
    return () => browser.storage.onChanged.removeListener(on as never);
  }, []);

  function select(p: SiteProfile) {
    if (dirty && !window.confirm(t('confirmDiscard'))) return;
    setSelectedId(p.id);
    setDraft(structuredClone(p));
    setDirty(false);
  }

  function edit(p: SiteProfile) {
    setDraft(p);
    setDirty(true);
  }

  async function clearPick() {
    setPick(null);
    await browser.storage.local.remove(PENDING_PICK_KEY);
  }

  async function pickAsNewProfile() {
    if (!pick) return;
    const host = hostOf(pick.url);
    const p = newProfile({
      name: host,
      urlPatterns: [`${host}/**`],
      fields: [newField({ label: t('role_body'), selector: pick.selector, maxChars: 3000 })],
    });
    await saveProfile(p);
    setSelectedId(p.id);
    setDraft(p);
    setDirty(false);
    await clearPick();
  }

  async function pickAsSnapshot() {
    if (!pick || !draft) return;
    edit({ ...draft, snapshot: { mode: draft.snapshot?.mode && draft.snapshot.mode !== 'off' ? draft.snapshot.mode : 'ask', selector: pick.selector } });
    await clearPick();
  }

  async function pickIntoDraft() {
    if (!pick || !draft) return;
    edit({ ...draft, fields: [...draft.fields, newField({ selector: pick.selector, maxChars: 3000 })] });
    await clearPick();
  }

  async function save() {
    if (!draft) return;
    await saveProfile(draft);
    setDirty(false);
  }

  async function reset() {
    if (!draft || !window.confirm(t('confirmProfileReset'))) return;
    await resetBuiltInProfile(draft.id);
    const fresh = (await listProfiles()).find((p) => p.id === draft.id);
    if (fresh) setDraft(structuredClone(fresh));
    setDirty(false);
  }

  async function remove() {
    if (!draft || !window.confirm(t('confirmProfileDelete', draft.name))) return;
    await deleteProfile(draft.id);
    setSelectedId(null);
    setDraft(null);
    setDirty(false);
  }

  return (
    <section class="sites">
      <h2>{t('navSites')}</h2>
      <p class="help">{t('sitesIntro')}</p>

      {pick && (
        <div class="banner pick-banner" role="status">
          <p class="status">{t('pickResult')}</p>
          <p class="sub mono">{pick.selector}</p>
          <p class="sub">{t('pickMatches', pick.matchCount)}</p>
          {pick.sample && <pre class="frag-text">{pick.sample}</pre>}
          <div class="actions">
            <button onClick={pickAsNewProfile}>{t('pickNewProfile')}</button>
            <button disabled={!draft} onClick={pickIntoDraft}>{t('pickAddToProfile')}</button>
            <button disabled={!draft} onClick={pickAsSnapshot}>{t('pickAsSnapshot')}</button>
            <button class="link" onClick={clearPick}>{t('cancel')}</button>
          </div>
        </div>
      )}

      <div class="sites-layout">
        <div class="profile-list">
          <ul>
            {(profiles ?? []).map((p) => (
              <li key={p.id}>
                <button
                  class="profile-item"
                  aria-current={p.id === selectedId ? 'true' : undefined}
                  onClick={() => select(p)}
                >
                  <strong>{p.name || '—'}</strong>
                  <span class="muted">
                    {p.builtIn ? t('profileBuiltIn') : t('profileCustom')}
                    {p.enabled ? '' : ` · ${t('profileDisabled')}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={() => {
              const p = newProfile({ name: t('profileNewName') });
              setSelectedId(p.id);
              setDraft(p);
              setDirty(true);
            }}
          >
            {t('profileNew')}
          </button>
        </div>
        <div class="profile-detail">
          {draft ? (
            <ProfileEditor
              draft={draft}
              setDraft={edit}
              dirty={dirty}
              onSave={save}
              onReset={reset}
              onDelete={remove}
            />
          ) : (
            <p class="empty">{t('profileSelectHint')}</p>
          )}
        </div>
      </div>
    </section>
  );
}
