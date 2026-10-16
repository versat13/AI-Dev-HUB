import { browser } from 'wxt/browser';
import { ensureBuiltInProfiles } from '@/lib/builtin-profiles';
import { db, newProfile, saveProfile } from '@/lib/db';
import type { ExtractResult } from '@/lib/extract-page';
import { resolveLocale, setLocale, t } from '@/lib/i18n';
import { SNAP_ATTR } from '@/lib/profile-extract';
import { pickProfile } from '@/lib/profile-match';
import { seedSamples } from '@/lib/samples';
import { saveFromPage } from '@/lib/save';
import { getSettings } from '@/lib/settings';
import { addSnapshot, cropScreenshot, type SnapRect } from '@/lib/snapshot';
import type { SectionKey } from '@/lib/ai';
import { addAiAnswer } from '@/lib/ai-db';
import type { AiAnswer, SaveMode, SaveOutcome, SiteProfile } from '@/lib/types';
import { openManager, PENDING_PICK_KEY } from '@/ui/nav';

interface SaveMessage {
  type: 'save';
  tabId: number;
  mode?: SaveMode;
  explicit?: boolean; // 右クリック・ショートカットからの保存（結果の画面がないので、保存済みでも自動で撮る）
}
interface SnapshotMessage {
  type: 'snapshot';
  tabId: number;
  scrapId: string;
  remember?: boolean; // このサイトでは次から自動で撮る
}
interface AiOpenMessage {
  type: 'ai-open';
  url: string;
  bridge: Record<string, unknown>; // aibridge.content.ts の BridgeCfg
}
interface AiAnswerMessage {
  type: 'ai-answer';
  scrapId: string;
  raw: string;
  service?: AiAnswer['service'];
  templateId?: string;
  expected?: SectionKey[];
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
    let snap: ExtractResult['snapshot'];
    const outcome = await saveFromPage(
      { url: tab.url ?? '', title: tab.title ?? '' },
      async () => {
        const ex = await runExtraction(msg.tabId, profile);
        snap = ex?.snapshot;
        return ex;
      },
      settings,
      msg.mode ?? 'auto',
    );
    // 保存した（または上書き・新規保存を選んだ）ときに撮る。何もしなかった再保存では画像を増やさない。
    // 設定のないサイトでも、結果の画面には必ず「撮る」を出す（範囲は画面に見えている部分）
    if (outcome.scrapId && outcome.kind !== 'failed') {
      const chosen = msg.mode === 'reextract' || msg.mode === 'separate' || msg.explicit;
      const fresh = outcome.kind === 'created' || outcome.kind === 'fragment-added' || chosen;
      if (fresh) {
        if (snap === 'auto') {
          const id = await captureSnapshot(msg.tabId, outcome.scrapId);
          outcome.snapshot = id ? 'taken' : 'failed';
          if (id) outcome.addedSnapshotId = id;
        } else outcome.snapshot = 'available';
      }
    }
    return outcome;
  } catch (e) {
    return { kind: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 印を付けた範囲を画面内に入れて撮影し、切り抜いて保存する。
 * captureVisibleTab は activeTab（ユーザーが保存を押したタブ）で使える。画面に見えている部分だけが写る。
 */
async function captureSnapshot(tabId: number, scrapId: string): Promise<string | null> {
  try {
    const tab = await browser.tabs.get(tabId);
    const [res] = await browser.scripting.executeScript({
      target: { tabId },
      func: (attr: string) =>
        new Promise<(SnapRect & { prevX: number; prevY: number }) | null>((resolve) => {
          const el = document.querySelector(`[${attr}]`);
          const prevX = scrollX;
          const prevY = scrollY;
          // 範囲の印がなければ、画面に見えている範囲全体を撮る
          if (!el) return resolve({ x: 0, y: 0, w: innerWidth, h: innerHeight, viewportW: innerWidth, prevX, prevY });
          const fits = el.getBoundingClientRect().height < innerHeight * 0.9;
          el.scrollIntoView({ block: fits ? 'center' : 'start', inline: 'nearest' });
          // 再描画と遅延読み込みの画像を少し待つ
          setTimeout(() => {
            const b = el.getBoundingClientRect();
            const x = Math.max(0, b.left);
            const y = Math.max(0, b.top);
            resolve({
              x,
              y,
              w: Math.min(b.right, innerWidth) - x,
              h: Math.min(b.bottom, innerHeight) - y,
              viewportW: innerWidth,
              prevX,
              prevY,
            });
          }, 350);
        }),
      args: [SNAP_ATTR],
    });
    const rect = res?.result as (SnapRect & { prevX: number; prevY: number }) | null | undefined;
    if (!rect || rect.w < 4 || rect.h < 4) return null;
    const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    await browser.scripting
      .executeScript({
        target: { tabId },
        func: (x: number, y: number) => scrollTo(x, y),
        args: [rect.prevX, rect.prevY],
      })
      .catch(() => undefined);
    return (await addSnapshot(scrapId, await cropScreenshot(dataUrl, rect))).id;
  } catch {
    return null;
  }
}

async function handleSnapshot(msg: SnapshotMessage): Promise<{ ok: boolean; id?: string }> {
  const id = await captureSnapshot(msg.tabId, msg.scrapId);
  const ok = !!id;
  if (ok && msg.remember) {
    const tab = await browser.tabs.get(msg.tabId);
    const p = tab.url ? await findProfile(tab.url).catch(() => undefined) : undefined;
    const rule = { selector: '@viewport', ...p?.snapshot, mode: 'auto' as const };
    if (p) {
      await db.siteProfiles.update(p.id, { snapshot: rule, modified: p.builtIn ? true : p.modified, updatedAt: Date.now() });
    } else if (tab.url) {
      // 設定のないサイト: そのドメイン用の自作設定（範囲は画面に見える部分）を作る
      const domain = new URL(tab.url).hostname;
      await saveProfile(newProfile({ name: domain, urlPatterns: [`${domain}/**`], snapshot: rule }));
    }
  }
  return { ok, id: id ?? undefined };
}

/** AIサービスを開き、読み込みが終わったら入力と取り込みボタンの仕組みを入れる */
async function handleAiOpen(msg: AiOpenMessage): Promise<{ ok: boolean }> {
  try {
    const tab = await browser.tabs.create({ url: msg.url });
    const tabId = tab.id!;
    await new Promise<void>((resolve) => {
      const done = (id: number, info: { status?: string }) => {
        if (id === tabId && info.status === 'complete') {
          browser.tabs.onUpdated.removeListener(done);
          resolve();
        }
      };
      browser.tabs.onUpdated.addListener(done);
      setTimeout(() => {
        browser.tabs.onUpdated.removeListener(done);
        resolve();
      }, 20_000);
    });
    await browser.scripting.executeScript({
      target: { tabId },
      func: (cfg: unknown) => {
        (globalThis as unknown as { __scrapaiBridge?: unknown }).__scrapaiBridge = cfg;
      },
      args: [msg.bridge],
    });
    await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/aibridge.js'] });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

async function handleAiAnswer(msg: AiAnswerMessage): Promise<{ ok: boolean }> {
  try {
    if (!msg.raw?.trim() || !(await db.scraps.get(msg.scrapId))) return { ok: false };
    const settings = await getSettings();
    await addAiAnswer({
      scrapId: msg.scrapId,
      raw: msg.raw,
      service: msg.service,
      templateId: msg.templateId,
      expected: msg.expected,
      applyToScrap: settings.aiApplyHeadline,
    });
    return { ok: true };
  } catch {
    return { ok: false };
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
  await flashBadge(await handleSave({ type: 'save', tabId, explicit: true }));
}

const MENU_ID = 'scrapai-save';

// contextMenus は任意権限のため、型定義に頼らず必要な部分だけ宣言する
interface MenuApi {
  removeAll(): Promise<void>;
  create(p: { id: string; title: string; contexts: string[] }, cb?: () => void): void;
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
  cm.create({ id: MENU_ID, title: t('ctxMenuSave'), contexts: ['page', 'selection'] }, () => {
    void browser.runtime.lastError; // 読んでおくと「Unchecked runtime.lastError」を出さない
  });
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

// 起動・インストール・権限・設定の変更が重なると removeAll と create が交錯して
// 「duplicate id」になるため、作り直しは1つずつ順番に行う
let menuQueue: Promise<void> = Promise.resolve();
function setupContextMenu(): Promise<void> {
  menuQueue = menuQueue
    .then(() => {
      listenContextMenu();
      return syncContextMenu();
    })
    .catch(() => undefined);
  return menuQueue;
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
  browser.runtime.onInstalled.addListener((details) => {
    void setupContextMenu().catch(() => undefined);
    // 初めて入れたときだけ、一覧にサンプルを置く（表示言語に合わせる）
    if (details.reason === 'install') {
      void getSettings()
        .then((s) => seedSamples(resolveLocale(s.locale, browser.i18n.getUILanguage())))
        .catch(() => undefined);
    }
  });
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
    if (type === 'ai-open') {
      handleAiOpen(message as AiOpenMessage).then(sendResponse);
      return true;
    }
    if (type === 'ai-answer') {
      handleAiAnswer(message as AiAnswerMessage).then(sendResponse);
      return true;
    }
    if (type === 'snapshot') {
      handleSnapshot(message as SnapshotMessage).then(sendResponse);
      return true;
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
