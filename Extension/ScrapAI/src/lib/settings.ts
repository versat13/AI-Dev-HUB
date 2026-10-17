import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, type Settings } from './types';

const KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(KEY);
  const merged = { ...DEFAULT_SETTINGS, ...((stored[KEY] as Partial<Settings> | undefined) ?? {}) };
  if (merged.geminiModel === 'gemini-2.5-flash') merged.geminiModel = DEFAULT_SETTINGS.geminiModel; // 旧い既定（新規利用者には提供終了）
  return merged;
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await browser.storage.local.set({ [KEY]: next });
  return next;
}
