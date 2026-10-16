import { useEffect, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { deleteFragments, deleteScraps } from '@/lib/db';
import { deleteSnapshot } from '@/lib/snapshot';
import { t } from '@/lib/i18n';
import type { SaveMode, SaveOutcome, Settings } from '@/lib/types';
import { ListBrowser } from '@/ui/ListBrowser';
import { Icon } from '@/ui/icons';
import { openInSidePanel, openManager } from '@/ui/nav';

type Banner =
  | { kind: 'saving' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; outcome: SaveOutcome }
  | { kind: 'undone' };

function extractLabel(status: SaveOutcome['extractStatus']) {
  if (status === 'ok') return { icon: '✓', text: t('extractOk'), warn: false };
  if (status === 'partial') return { icon: '△', text: t('extractPartial'), warn: true };
  return { icon: '!', text: t('extractFailed'), warn: true };
}

export function App({ settings }: { settings: Settings }) {
  const [banner, setBanner] = useState<Banner | null>(null);
  const saving = banner?.kind === 'saving';

  // 保存はボタンを押したときだけ行う。実際の処理は背景ページ（ポップアップが閉じても完了させるため）
  async function save(mode: SaveMode = 'auto') {
    setBanner({ kind: 'saving' });
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab?.id == null) {
        setBanner({ kind: 'error', message: t('errorNoTab') });
        return;
      }
      const outcome = (await browser.runtime.sendMessage({
        type: 'save',
        tabId: tab.id,
        mode,
      })) as SaveOutcome | undefined;

      if (!outcome || outcome.kind === 'failed') {
        const reason = outcome?.error === 'no-url' ? t('errorNoTab') : (outcome?.error ?? 'unknown');
        setBanner({ kind: 'error', message: t('errorSave', reason) });
        return;
      }
      setBanner({ kind: 'done', outcome });
    } catch (e) {
      setBanner({ kind: 'error', message: t('errorSave', e instanceof Error ? e.message : String(e)) });
    }
  }

  // 取り消しは「今回の保存で増えたもの」だけを元に戻す
  async function undo(o: SaveOutcome) {
    if (o.kind === 'created' && o.scrapId) await deleteScraps([o.scrapId]);
    else if (o.kind === 'fragment-added' && o.addedFragmentIds) {
      await deleteFragments(o.addedFragmentIds);
      if (o.addedSnapshotId) await deleteSnapshot(o.addedSnapshotId);
    }
    setBanner({ kind: 'undone' });
  }

  // 要素ピッカーは対象ページで操作するため、起動を依頼したらポップアップを閉じる
  async function startPicker() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) {
      setBanner({ kind: 'error', message: t('errorNoTab') });
      return;
    }
    const res = (await browser.runtime.sendMessage({ type: 'start-picker', tabId: tab.id })) as
      | { ok: boolean; error?: string }
      | undefined;
    if (res?.ok) window.close();
    else setBanner({ kind: 'error', message: t('errorSave', res?.error ?? 'unknown') });
  }

  return (
    <main class="popup">
      <header class="popup-head">
        <span class="brand"><img src="/icon/32.png" width="18" height="18" alt="" />ScrapAI</span>
        <span class="spacer" />
        <button class="icon-btn" aria-label={t('openSidePanel')} title={t('openSidePanel')} onClick={() => openInSidePanel()}>
          <Icon name="panel" />
        </button>
        <button class="icon-btn" aria-label={t('openManager')} title={t('openManager')} onClick={() => openManager()}>
          <Icon name="manager" />
        </button>
      </header>
      <button class="primary save-btn" disabled={saving} onClick={() => save('auto')}>
        {saving ? t('saving') : t('saveButton')}
      </button>

      {banner && banner.kind !== 'saving' && (
        <ResultBanner
          banner={banner}
          onSave={save}
          onUndo={undo}
          onOpen={(id) => openInSidePanel(id)}
          onRetry={() => save('auto')}
        />
      )}

      <ListBrowser settings={settings} onOpen={(id) => openInSidePanel(id)} />

      <footer class="popup-foot">
        <button class="link" onClick={startPicker}><Icon name="pick" size={13} /> {t('pickElement')}</button>
        <button class="link" onClick={() => openManager(undefined, 'sites')}><Icon name="sites" size={13} /> {t('navSites')}</button>
      </footer>
      <p class="note">{t('localOnly')}</p>
    </main>
  );
}

function ResultBanner(props: {
  banner: Exclude<Banner, { kind: 'saving' }>;
  onSave: (mode: SaveMode) => void;
  onUndo: (o: SaveOutcome) => void;
  onOpen: (id: string) => void;
  onRetry: () => void;
}) {
  const { banner } = props;

  if (banner.kind === 'error') {
    return (
      <div class="banner" role="alert">
        <p class="status error"><span class="icon" aria-hidden="true">!</span> {banner.message}</p>
        <div class="actions"><button onClick={props.onRetry}>{t('retry')}</button></div>
      </div>
    );
  }
  if (banner.kind === 'undone') {
    return (
      <div class="banner" role="status">
        <p class="status"><span class="icon" aria-hidden="true">✓</span> {t('undone')}</p>
      </div>
    );
  }

  const o = banner.outcome;
  const ex = extractLabel(o.extractStatus);
  let headline = t('savedNew');
  if (o.kind === 'fragment-added') headline = t('fragmentAdded', o.fragmentCount ?? 0);
  if (o.kind === 'duplicate-fragment') headline = t('duplicateFragment');
  if (o.kind === 'already-saved') headline = t('alreadySaved');
  const canUndo = o.kind === 'created' || o.kind === 'fragment-added';

  return (
    <div class="banner" role="status">
      <p class="status"><span class="icon" aria-hidden="true">✓</span> {headline}</p>
      <p class="sub">{o.title}</p>
      <p class={`sub ${ex.warn ? 'warn' : ''}`}>
        <span class="icon" aria-hidden="true">{ex.icon}</span> {ex.text}
        {o.fragmentCount ? ` · ${t('fragmentsCount', o.fragmentCount)}` : ''}
      </p>
      {o.snapshot && o.scrapId && <SnapshotOffer outcome={o} onTaken={(id) => (o.addedSnapshotId = id)} />}
      <div class="actions">
        {o.kind === 'already-saved' && (
          <>
            <button onClick={() => props.onSave('reextract')}>{t('reextract')}</button>
            <button onClick={() => props.onSave('separate')}>{t('saveSeparate')}</button>
          </>
        )}
        {o.scrapId && <button onClick={() => props.onOpen(o.scrapId!)}>{t('openDetail')}</button>}
        {canUndo && <button onClick={() => props.onUndo(o)}>{t('undo')}</button>}
      </div>
    </div>
  );
}

/** 保存結果のスナップショット欄: 撮れるときはボタン、自動で撮ったときは結果を出す */
function SnapshotOffer({ outcome, onTaken }: { outcome: SaveOutcome; onTaken: (id: string) => void }) {
  const [state, setState] = useState<'idle' | 'taking' | 'taken' | 'failed'>(
    outcome.snapshot === 'taken' ? 'taken' : outcome.snapshot === 'failed' ? 'failed' : 'idle',
  );
  const [remember, setRemember] = useState(false);
  useEffect(() => setRemember(false), [outcome.scrapId]);

  async function take() {
    setState('taking');
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const res = (await browser.runtime.sendMessage({
      type: 'snapshot',
      tabId: tab?.id,
      scrapId: outcome.scrapId,
      remember,
    })) as { ok: boolean; id?: string } | undefined;
    if (res?.id) onTaken(res.id);
    setState(res?.ok ? 'taken' : 'failed');
  }

  if (state === 'taken') return <p class="sub snap-line">📷 {t('snapshotSaved')}</p>;
  if (state === 'failed') return <p class="sub warn snap-line">{t('snapshotFailed')}</p>;
  return (
    <div class="snap-offer">
      <button disabled={state === 'taking'} onClick={take}>📷 {t('snapshotTake')}</button>
      <label class="check small">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember((e.target as HTMLInputElement).checked)} />
        {t('snapshotRemember')}
      </label>
    </div>
  );
}
