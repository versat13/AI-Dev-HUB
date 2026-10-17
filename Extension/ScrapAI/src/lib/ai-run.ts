import { browser } from 'wxt/browser';
import { buildPrompt, getServices, promptLangs, resolveTemplates, type ResolvedTemplate } from './ai';
import { listCustomTemplates } from './ai-db';
import { listFragments, db } from './db';
import { getLocale, resolveLocale, setLocale } from './i18n';
import type { AiServiceCfg, Settings } from './types';
import { fragLabel } from '../ui/format';

// 「AIボタン」の裏側: プロンプトを作り、Gemini API を呼ぶ／AIサービスのタブを裏で開く。
// Gemini API のキーは設定とは別の場所（この端末の storage.local）に置き、同期・書き出しには含めない。

export const GEMINI_KEY_STORAGE = 'geminiApiKey';
export const GEMINI_ORIGIN = 'https://generativelanguage.googleapis.com/*';
export const JOBS_KEY = 'aiJobs';

export type JobState = 'running' | 'done' | 'failed';
export interface Job {
  state: JobState;
  at: number;
  tabId?: number;
  reason?: string;
}
export type Jobs = Record<string, Job>;

export async function getGeminiKey(): Promise<string> {
  const r = await browser.storage.local.get(GEMINI_KEY_STORAGE);
  return typeof r[GEMINI_KEY_STORAGE] === 'string' ? (r[GEMINI_KEY_STORAGE] as string) : '';
}

export async function setGeminiKey(key: string): Promise<void> {
  if (key.trim()) await browser.storage.local.set({ [GEMINI_KEY_STORAGE]: key.trim() });
  else await browser.storage.local.remove(GEMINI_KEY_STORAGE);
}

/** 処理中・完了・失敗の状態（ポップアップなどのボタン表示用。ブラウザを閉じれば消える） */
export async function setJob(scrapId: string, job: Omit<Job, 'at'>): Promise<void> {
  const cur = ((await browser.storage.session.get(JOBS_KEY))[JOBS_KEY] as Jobs | undefined) ?? {};
  await browser.storage.session.set({ [JOBS_KEY]: { ...cur, [scrapId]: { ...job, at: Date.now() } } });
}

/** 資料（保存した断片）からプロンプトを作る。画面と同じ言語の決め方 */
export async function promptFor(
  scrapId: string,
  settings: Pick<Settings, 'locale' | 'aiPromptLang'>,
  templateId: string,
): Promise<{ prompt: string; tpl: ResolvedTemplate } | null> {
  const scrap = await db.scraps.get(scrapId);
  if (!scrap) return null;
  const uiCode = browser.i18n.getUILanguage();
  setLocale(resolveLocale(settings.locale, uiCode));
  const lang = getLocale();
  const langs = promptLangs(lang, settings.aiPromptLang, settings.locale === 'auto' ? uiCode : lang);
  const templates = resolveTemplates(await listCustomTemplates(), lang, langs.bodyLang);
  const tpl = templates.find((x) => x.id === templateId) ?? templates[0]!;
  const frags = await listFragments(scrapId);
  return { prompt: buildPrompt(tpl, scrap, frags, langs, (l) => fragLabel(l, langs.bodyLang)), tpl };
}

/** Gemini API にプロンプトを送り、回答の文章を返す。失敗は Error（メッセージにキーは含めない） */
export async function callGemini(
  prompt: string,
  model: string,
  key: string,
  doFetch: typeof fetch = fetch,
): Promise<string> {
  const res = await doFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error('empty');
  return text;
}

/** AIボタンの送り先のサービス（設定から。なければ先頭） */
export function pickService(settings: Pick<Settings, 'aiServices' | 'aiButtonService'>): AiServiceCfg | undefined {
  const list = getServices(settings.aiServices);
  return list.find((s) => s.id === settings.aiButtonService) ?? list[0];
}
