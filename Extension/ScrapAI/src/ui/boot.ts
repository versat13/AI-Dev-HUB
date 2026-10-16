import { browser } from 'wxt/browser';
import { resolveLocale, setLocale } from '@/lib/i18n';
import { getSettings } from '@/lib/settings';
import type { Settings } from '@/lib/types';

/** 設定を読み、表示言語を反映する。各画面の起動時に呼ぶ */
export async function bootUi(): Promise<Settings> {
  const settings = await getSettings();
  applyLocale(settings);
  applyTheme(settings);
  // 別の画面でテーマを変えたら、開いている画面にもすぐ反映する
  browser.storage.onChanged.addListener((c, area) => {
    const next = c.settings?.newValue as Settings | undefined;
    if (area === 'local' && next) applyTheme(next);
  });
  return settings;
}

export function applyTheme(settings: Pick<Settings, 'theme'>): void {
  document.documentElement.dataset.theme = settings.theme ?? 'light';
}

export function applyLocale(settings: Settings): void {
  const locale = resolveLocale(settings.locale, browser.i18n.getUILanguage());
  setLocale(locale);
  document.documentElement.lang = locale;
}
