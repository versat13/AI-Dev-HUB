import { useEffect, useRef, useState } from 'preact/hooks';
import { browser } from 'wxt/browser';
import { t } from '@/lib/i18n';
import type { Settings } from '@/lib/types';
import { DetailView } from '@/ui/DetailView';
import { ListBrowser } from '@/ui/ListBrowser';
import { Icon } from '@/ui/icons';
import { OPEN_SCRAP_KEY, openManager } from '@/ui/nav';

interface OpenRequest {
  id: string;
  at: number;
}

/**
 * サイドパネル: 一覧と詳細。ポップアップから項目を開くよう依頼されると詳細に切り替わる。
 * 保存ボタンは置かない（activeTab は拡張機能アイコンをクリックしたタブにしか付与されないため）。
 */
export function App({ settings }: { settings: Settings }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 「サイドパネルを自動で閉じない」（設定画面）。パネルを開いたまま設定を変えても反映する
  const keepRef = useRef(settings.panelKeepOpen);
  useEffect(() => {
    const onChanged = (c: Record<string, { newValue?: unknown }>, area: string) => {
      const next = c.settings?.newValue as Settings | undefined;
      if (area === 'local' && next) keepRef.current = next.panelKeepOpen;
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  // 読み終えてページをクリックしたら（パネルからフォーカスが外れたら）自動で閉じる。
  // 「開いたままにする」がオンのときは閉じない
  useEffect(() => {
    let timer: number | undefined;
    const onBlur = () => {
      if (keepRef.current) return;
      timer = window.setTimeout(() => {
        if (!document.hasFocus() && !keepRef.current) void closePanel();
      }, 400);
    };
    const onFocus = () => window.clearTimeout(timer);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    // パネルを開いた時点で既に依頼がある場合（直前にポップアップから開かれた）
    browser.storage.session.get(OPEN_SCRAP_KEY).then((r) => {
      const req = r[OPEN_SCRAP_KEY] as OpenRequest | undefined;
      if (req && Date.now() - req.at < 10_000) setSelectedId(req.id);
    });
    // パネルが開いたままの場合
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'session') return;
      const req = changes[OPEN_SCRAP_KEY]?.newValue as OpenRequest | undefined;
      if (req) setSelectedId(req.id);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  return (
    <main class="panel">
      {selectedId ? (
        <DetailView
          key={selectedId}
          scrapId={selectedId}
          closeLabel={t('back')}
          onClose={() => setSelectedId(null)}
          onOpenOther={(id) => setSelectedId(id)}
        />
      ) : (
        <div class="panel-list" key="list">
          {/* パネルの名前は Chrome が上に出すので、ここでは見出しを出さない */}
          <ListBrowser
            settings={settings}
            onOpen={setSelectedId}
            barExtra={
              <>
                <button class="icon-btn" aria-label={t('openManager')} title={t('openManager')} onClick={() => openManager()}>
                  <Icon name="manager" />
                </button>
              </>
            }
          />
        </div>
      )}
    </main>
  );
}

async function closePanel(): Promise<void> {
  try {
    // Chrome 141 以降は sidePanel.close がある。なければ window.close で閉じる
    const sp = browser.sidePanel as unknown as { close?: (o: { windowId: number }) => Promise<void> };
    if (sp.close) {
      const win = await browser.windows.getCurrent();
      await sp.close({ windowId: win.id! });
      return;
    }
  } catch {
    // 下で閉じる
  }
  window.close();
}
