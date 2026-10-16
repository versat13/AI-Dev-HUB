import { browser } from 'wxt/browser';
import { resolveLocale, setLocale } from '@/lib/i18n';
import { getSettings } from '@/lib/settings';
import type { Settings } from '@/lib/types';

/** 設定を読み、表示言語を反映する。各画面の起動時に呼ぶ */
export async function bootUi(): Promise<Settings> {
  const settings = await getSettings();
  applyLocale(settings);
  return settings;
}

export function applyLocale(settings: Settings): void {
  const locale = resolveLocale(settings.locale, browser.i18n.getUILanguage());
  setLocale(locale);
  document.documentElement.lang = locale;
}
