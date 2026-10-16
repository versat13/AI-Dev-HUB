import { browser } from 'wxt/browser';

const MANAGER_PATH = '/manager.html';

/** 要素ピッカーの選択結果の受け渡し用（storage.local） */
export const PENDING_PICK_KEY = 'pendingPick';

export interface PendingPick {
  url: string;
  selector: string;
  matchCount: number;
  sample: string;
  at: number;
}

export type ManagerSection = 'library' | 'categories' | 'sites' | 'settings';

function managerUrl(scrapId?: string, section?: ManagerSection): string {
  const base = browser.runtime.getURL(MANAGER_PATH as never);
  if (scrapId) return `${base}#scrap=${encodeURIComponent(scrapId)}`;
  if (section) return `${base}#section=${section}`;
  return base;
}

/** 管理タブを開く（既に開いていればそのタブを前面に出す） */
export async function openManager(scrapId?: string, section?: ManagerSection): Promise<void> {
  const url = managerUrl(scrapId, section);
  const existing = await browser.tabs.query({ url: managerUrl().split('#')[0] + '*' });
  const tab = existing[0];
  if (tab?.id != null) {
    await browser.tabs.update(tab.id, { active: true, url: scrapId || section ? url : undefined });
    if (tab.windowId != null) await browser.windows.update(tab.windowId, { focused: true });
    return;
  }
  await browser.tabs.create({ url });
}

/** サイドパネルで項目を開くよう依頼する。パネル側は storage.session の変更を監視している */
export const OPEN_SCRAP_KEY = 'openScrap';

export async function openInSidePanel(scrapId?: string): Promise<void> {
  try {
    const win = await browser.windows.getCurrent();
    // ユーザー操作の直後に開く必要があるため、先に open を呼ぶ
    const opened = browser.sidePanel.open({ windowId: win.id! });
    if (scrapId) await browser.storage.session.set({ [OPEN_SCRAP_KEY]: { id: scrapId, at: Date.now() } });
    await opened;
  } catch {
    // サイドパネルを開けない環境では管理タブで開く
    await openManager(scrapId);
  }
}
