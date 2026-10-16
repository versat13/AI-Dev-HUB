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

export default defineBackground(() => {
  void ensureBuiltInProfiles().catch(() => undefined);

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
