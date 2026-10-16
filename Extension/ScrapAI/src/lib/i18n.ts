// 文言は src/public/_locales/{en,ja}/messages.json に集約する。
// 設定で表示言語を切り替えられるよう chrome.i18n.getMessage は使わず、同じJSONを直接読む。
// （manifest の name / description だけは Chrome が _locales を直接参照する）
import en from '../public/_locales/en/messages.json';
import ja from '../public/_locales/ja/messages.json';

type Dict = Record<string, { message: string }>;
export type Locale = 'ja' | 'en';

const dicts: Record<Locale, Dict> = { en: en as Dict, ja: ja as Dict };

let current: Locale = 'en';

export function resolveLocale(setting: 'auto' | Locale, uiLanguage: string): Locale {
  if (setting === 'ja' || setting === 'en') return setting;
  return uiLanguage.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

/** 翻訳。{0} {1} ... を引数で置換する。キーが無ければ英語、それも無ければキーを返す */
export function t(key: string, ...args: (string | number)[]): string {
  const msg = dicts[current][key]?.message ?? dicts.en[key]?.message ?? key;
  return msg.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ''));
}
