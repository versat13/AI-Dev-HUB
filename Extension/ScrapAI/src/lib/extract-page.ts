import { Readability } from '@mozilla/readability';

// ページ内で実行する抽出処理。注入先のページには何も残さず、結果のオブジェクトだけを返す。
// 文字数上限はここでは大きめの安全上限だけを掛け、設定値による切り詰めは保存側で行う。

import { HARD_CAP } from './limits';
import type { ProfileExtraction } from './profile-extract';

export { HARD_CAP };

export interface ExtractResult {
  url: string;
  title: string; // document.title
  ogTitle: string;
  siteName: string;
  description: string;
  ogImage: string;
  faviconUrl: string;
  selection: string;
  articleTitle: string;
  articleText: string;
  lang: string;
  profile?: ProfileExtraction; // サイトプロファイルが適用されたときのみ（content script が付与）
}

function meta(doc: Document, selector: string): string {
  return doc.querySelector<HTMLMetaElement>(selector)?.content?.trim() ?? '';
}

function cap(text: string): string {
  return text.length > HARD_CAP ? text.slice(0, HARD_CAP) : text;
}

export function extractFromDocument(doc: Document, win: Window): ExtractResult {
  const selection = cap(win.getSelection?.()?.toString() ?? '');

  let articleTitle = '';
  let articleText = '';
  try {
    // Readability は渡した文書を書き換えるため、複製に対して実行する
    const article = new Readability(doc.cloneNode(true) as Document).parse();
    articleTitle = article?.title?.trim() ?? '';
    articleText = cap(article?.textContent ?? '');
  } catch {
    // 抽出失敗は想定内。URLとタイトル、OGPだけ返す
  }

  const description =
    meta(doc, 'meta[property="og:description"]') || meta(doc, 'meta[name="description"]');

  return {
    url: doc.location?.href ?? '',
    title: doc.title ?? '',
    ogTitle: meta(doc, 'meta[property="og:title"]'),
    siteName: meta(doc, 'meta[property="og:site_name"]'),
    description,
    ogImage: meta(doc, 'meta[property="og:image"]'),
    faviconUrl: doc.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ?? '',
    selection,
    articleTitle,
    articleText,
    lang: doc.documentElement?.lang ?? '',
  };
}
