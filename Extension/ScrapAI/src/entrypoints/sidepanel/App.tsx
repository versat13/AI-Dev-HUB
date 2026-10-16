import { useEffect, useState } from 'preact/hooks';
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
          <header class="popup-head">
            <span class="brand"><img src="/icon/32.png" width="18" height="18" alt="" />ScrapAI</span>
            <span class="spacer" />
            <button class="icon-btn" aria-label={t('openManager')} title={t('openManager')} onClick={() => openManager()}>
              <Icon name="manager" />
            </button>
          </header>
          <ListBrowser settings={settings} onOpen={setSelectedId} />
        </div>
      )}
    </main>
  );
}
