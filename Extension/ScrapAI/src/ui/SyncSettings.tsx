import { useEffect, useState } from 'preact/hooks';
import { t } from '@/lib/i18n';
import {
  deviceInfo,
  folderPermission,
  handleDir,
  listDevices,
  savedFolder,
  saveFolder,
  setDeviceName,
  syncOnce,
  type SyncReport,
} from '@/lib/sync';
import { db } from '@/lib/db';
import { formatDateTime } from './format';
import { useLive } from './hooks';

type Picker = (o: { mode: 'readwrite'; id?: string }) => Promise<FileSystemDirectoryHandle>;
const picker = () => (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker;

/** 管理画面「同期」: 同期フォルダを選び、PCどうしで同じデータを使う */
export function SyncSettings() {
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  const [perm, setPerm] = useState<PermissionState | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [devices, setDevices] = useState<Awaited<ReturnType<typeof listDevices>>>([]);
  const last = useLive(async () => (await db.meta.get('syncLast'))?.value as (SyncReport & { at: number }) | undefined, []);

  async function refresh(h = folder) {
    if (!h) return;
    const p = await folderPermission(h);
    setPerm(p);
    if (p === 'granted') setDevices(await listDevices(handleDir(h)));
  }

  useEffect(() => {
    void (async () => {
      setName((await deviceInfo()).name);
      const h = await savedFolder();
      setFolder(h);
      await refresh(h);
    })();
  }, []);

  async function choose() {
    const pick = picker();
    if (!pick) return setErr(t('syncUnsupported'));
    try {
      const h = await pick({ mode: 'readwrite', id: 'scrapai-sync' });
      await saveFolder(h);
      setFolder(h);
      setErr('');
      await refresh(h);
      await run(h);
    } catch {
      // 選ぶのをやめたとき
    }
  }

  async function allow() {
    if (!folder) return;
    setPerm(await folderPermission(folder, true));
    await refresh();
  }

  async function run(h = folder) {
    if (!h) return;
    setBusy(true);
    setMsg('');
    setErr('');
    try {
      if ((await folderPermission(h, true)) !== 'granted') throw new Error('perm');
      const r = await syncOnce(handleDir(h));
      setMsg(t('syncDone', r.read.length, r.added + r.updated, r.removed));
      await refresh(h);
    } catch (e) {
      setErr(e instanceof Error && e.message === 'perm' ? t('syncNeedPermission') : t('syncFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    await saveFolder(null);
    setFolder(null);
    setPerm(null);
    setDevices([]);
  }

  return (
    <section class="settings sync">
      <h2>{t('navSync')}</h2>
      <p class="help">{t('syncIntro')}</p>

      <div class="set-card">
        <h3>{t('syncFolder')}</h3>
        {!folder ? (
          <>
            <ol class="sync-steps">
              <li>{t('syncStep1')}</li>
              <li>{t('syncStep2')}</li>
              <li>{t('syncStep3')}</li>
            </ol>
            <div class="set-row">
              <button class="primary" onClick={choose}>{t('syncChoose')}</button>
            </div>
          </>
        ) : (
          <>
            <div class="set-row">
              <span>{t('syncFolderName')}</span>
              <strong class="mono">{folder.name}</strong>
              <span class={`badge sync-${perm}`}>{perm === 'granted' ? t('syncConnected') : t('syncNotAllowed')}</span>
            </div>
            {perm !== 'granted' && (
              <div class="set-row">
                <p class="help">{t('syncReallowHelp')}</p>
                <button class="primary" onClick={allow}>{t('syncAllow')}</button>
              </div>
            )}
            <div class="set-row">
              <button class="primary" disabled={busy} onClick={() => run()}>{busy ? t('syncing') : t('syncNow')}</button>
              <button onClick={choose}>{t('syncChange')}</button>
              <button class="link" onClick={stop}>{t('syncStop')}</button>
            </div>
          </>
        )}
        {msg && <p class="ok" role="status">{msg}</p>}
        {err && <p class="error" role="alert">{err}</p>}
      </div>

      <div class="set-card">
        <h3>{t('syncThisPc')}</h3>
        <label class="set-row">
          <span>{t('syncPcName')}</span>
          <input
            value={name}
            placeholder={t('syncPcNamePlaceholder')}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onBlur={() => setDeviceName(name)}
          />
        </label>
        <p class="help">{last ? t('syncLast', formatDateTime(last.at)) : t('syncNever')}</p>
        <p class="help">{t('syncAuto')}</p>
      </div>

      {devices.length > 0 && (
        <div class="set-card">
          <h3>{t('syncDevices')}</h3>
          <ul class="sync-devices">
            {devices.map((d) => (
              <li key={d.deviceId}>
                <strong>{d.name}</strong>
                {d.mine && <span class="badge">{t('syncMine')}</span>}
                <span class="spacer" />
                <span class="muted">{formatDateTime(d.lastModified)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** 管理画面を開いている間の自動同期（開いたとき・1分ごと・画面に戻ったとき）。許可がない間は何もしない */
export function useAutoSync(): void {
  useEffect(() => {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const h = await savedFolder();
        if (h && (await folderPermission(h)) === 'granted') await syncOnce(handleDir(h));
      } catch {
        // 次の機会にやり直す
      } finally {
        running = false;
      }
    };
    void tick();
    const timer = window.setInterval(tick, 60_000);
    const onFocus = () => void tick();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
}
