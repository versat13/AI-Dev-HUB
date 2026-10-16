import { browser } from 'wxt/browser';
import { ensureBuiltInProfiles } from '@/lib/builtin-profiles';
import { db } from '@/lib/db';
import type { ExtractResult } from '@/lib/extract-page';
import { resolveLocale, setLocale, t } from '@/lib/i18n';
import { pickProfile } from '@/lib/profile-match';
import { saveFromPage } from '@/lib/save';
import { getSettings } from '@/lib/settings';
import type { SaveMode, SaveOutcome, SiteProfile } from '@/lib/types';
import { openManager, PENDING_PICK_KEY } from '@/ui/nav';

interface SaveMessage {
  type: 'save';
  tabId: number;
  mode?: SaveMode;
}
interface PickerMessage {
  type: 'start-picker';
  tabId: number;
}
interface PickedMessage {
  type: 'picked';
  pick: { url: string; selector: string; matchCount: number; sample: string; at: number };
}

async function findProfile(url: string): Promise<SiteProfile | undefined> {
  await ensureBuiltInProfiles();
  return pickProfile(await db.siteProfiles.toArray(), url);
}

async function runExtraction(tabId: number, profile?: SiteProfile): Promise<ExtractResult | null> {
  if (profile) {
    // 分離ワールドに一時変数でプロファイルを渡す（ページ側のスクリプトからは見えない）
    await browser.scripting.executeScript({
      target: { tabId },
      func: (p: unknown) => {
        (globalThis as unknown as { __scrapaiProfile?: unknown }).__scrapaiProfile = p;
      },
      args: [profile],
    });
  }
  const results = await browser.scripting.executeScript({
    target: { tabId },
    files: ['/content-scripts/extract.js'],
  });
  return (results[0]?.result as ExtractResult | undefined) ?? null;
}

async function handleSave(msg: SaveMessage): Promise<SaveOutcome> {
  try {
    const tab = await browser.tabs.get(msg.tabId);
    const settings = await getSettings();
    const profile = tab.url ? await findProfile(tab.url).catch(() => undefined) : undefined;
    return await saveFromPage(
      { url: tab.url ?? '', title: tab.title ?? '' },
      () => runExtraction(msg.tabId, profile),
      settings,
      msg.mode ?? 'auto',
    );
  } catch (e) {
    return { kind: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

async function handleStartPicker(msg: PickerMessage): Promise<{ ok: boolean; error?: string }> {
  try {
    const settings = await getSettings();
    setLocale(resolveLocale(settings.locale, browser.i18n.getUILanguage()));
    await browser.scripting.executeScript({
      target: { tabId: msg.tabId },
      func: (cfg: unknown) => {
        (globalThis as unknown as { __scrapaiPickerCfg?: unknown }).__scrapaiPickerCfg = cfg;
      },
      args: [{ tip: t('pickerTip') }],
    });
    await browser.scripting.executeScript({
      target: { tabId: msg.tabId },
      files: ['/content-scripts/picker.js'],
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---- ショートカット・右クリック（P6）。どちらも既定ではオフ ----

/** 保存結果をツールバーアイコンのバッジで知らせる（ポップアップが開かない経路用） */
async function flashBadge(outcome: SaveOutcome): Promise<void> {
  const ok = outcome.kind !== 'failed';
  await browser.action.setBadgeBackgroundColor({ color: ok ? '#1a7f37' : '#cf222e' });
  await browser.action.setBadgeText({ text: ok ? '✓' : '!' });
  setTimeout(() => void browser.action.setBadgeText({ text: '' }), 2500);
}

async function saveTab(tabId: number | undefined): Promise<void> {
  if (tabId == null) return;
  await flashBadge(await handleSave({ type: 'save', tabId }));
}

const MENU_ID = 'scrapai-save';

// contextMenus は任意権限のため、型定義に頼らず必要な部分だけ宣言する
interface MenuApi {
  removeAll(): Promise<void>;
  create(p: { id: string; title: string; contexts: string[] }): void;
  onClicked: { addListener(cb: (info: { menuItemId: string | number }, tab?: { id?: number }) => void): void };
}
const menuApi = () => (browser as unknown as { contextMenus?: MenuApi }).contextMenus;

async function syncContextMenu(): Promise<void> {
  const cm = menuApi();
  if (!cm) return; // 権限がないときはAPI自体がない
  await cm.removeAll();
  const settings = await getSettings();
  if (!settings.contextMenu) return;
  setLocale(resolveLocale(settings.locale, browser.i18n.getUILanguage()));
  cm.create({ id: MENU_ID, title: t('ctxMenuSave'), contexts: ['page', 'selection'] });
}

let menuListening = false;
function listenContextMenu(): void {
  const cm = menuApi();
  if (!cm || menuListening) return;
  menuListening = true;
  cm.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_ID) void saveTab(tab?.id);
  });
}

async function setupContextMenu(): Promise<void> {
  listenContextMenu();
  await syncContextMenu();
}

export default defineBackground(() => {
  void ensureBuiltInProfiles().catch(() => undefined);

  browser.commands.onCommand.addListener(async (command) => {
    if (command === 'save-page') {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      await saveTab(tab?.id);
    } else if (command === 'open-manager') {
      await openManager();
    }
  });

  void setupContextMenu().catch(() => undefined);
  browser.runtime.onInstalled.addListener(() => void setupContextMenu().catch(() => undefined));
  browser.permissions.onAdded.addListener(() => void setupContextMenu().catch(() => undefined));
  browser.permissions.onRemoved.addListener(() => void setupContextMenu().catch(() => undefined));
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) void setupContextMenu().catch(() => undefined);
  });

  // 保存処理はポップアップではなくここで行う（ポップアップが閉じても完了させるため）。
  // ショートカット・右クリック（P6）も同じ handleSave を使う。
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const type = (message as { type?: string } | undefined)?.type;
    if (type === 'save') {
      handleSave(message as SaveMessage).then(sendResponse);
      return true; // 非同期で応答する
    }
    if (type === 'start-picker') {
      handleStartPicker(message as PickerMessage).then(sendResponse);
      return true;
    }
    if (type === 'picked') {
      // 選択結果を保存して、サイト設定画面を開く
      browser.storage.local
        .set({ [PENDING_PICK_KEY]: (message as PickedMessage).pick })
        .then(() => openManager(undefined, 'sites'));
      return undefined;
    }
    return undefined;
  });
});
