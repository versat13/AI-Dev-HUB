// データモデル（仕様書3章）。全レコードに id(UUID) と createdAt / updatedAt を持たせる。

export type ExtractStatus = 'ok' | 'partial' | 'failed';

export interface Scrap {
  id: string;
  url: string; // 保存時の元URL（書き換えない）
  normalizedUrl: string; // 重複検出キー
  title: string;
  originalTitle?: string; // 日本語訳を適用する前のタイトル（元に戻す用）
  siteName: string;
  domain: string;
  ogImageUrl?: string;
  faviconUrl?: string;
  profileId?: string; // 適用したサイトプロファイル（P3）
  extractStatus: ExtractStatus;
  stars: number | null; // 1..5、null = 未評価
  pinned: boolean;
  archivedAt: number | null;
  categoryIds: string[]; // 空 = 未分類
  memo: string;
  excerpt: string; // 一覧用概要（最大120字）
  aiAnswerCount: number; // 「AI要約 あり／なし」表示用
  createdAt: number;
  updatedAt: number;
}

export type FragmentSource = 'rule' | 'selection' | 'picked' | 'readability' | 'meta' | 'translation';
export type FragmentRole = 'title' | 'author' | 'date' | 'body' | 'custom';

export interface Fragment {
  id: string;
  scrapId: string;
  order: number;
  source: FragmentSource;
  // 組み込みの汎用ラベルは 'selection' | 'article' | 'description'（UIで翻訳）。
  // サイトプロファイル由来のラベルはユーザー定義の文字列。
  fieldLabel: string;
  role: FragmentRole;
  text: string; // 文字数上限適用後
  truncated: boolean;
  anchor?: string; // レス番号・投稿IDなど（P3）
  permalink?: string;
  extras?: { label: string; role: FragmentRole; text: string }[]; // 投稿者・日時など、本文以外の項目（P3）
  imageUrls?: string[]; // URLのみ。画像自体は保存しない
  createdAt: number;
}

export type AiParseStatus = 'ok' | 'partial' | 'failed';

export interface AiAnswer {
  id: string;
  scrapId: string;
  fragmentIds?: string[];
  service?: 'chatgpt' | 'claude' | 'gemini' | 'other';
  templateId?: string;
  raw: string; // 貼り付け原文（常に保存）
  sections: { key: string; body: string }[];
  parseStatus: AiParseStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  color?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface FieldRule {
  id: string;
  label: string;
  role: FragmentRole;
  selector: string;
  attr?: string; // 省略時は textContent
  match: 'first' | 'all';
  maxChars: number | null;
  joinWith?: string;
}

/**
 * 繰り返し単位（レス・投稿など）の抽出ルール。
 * 1単位が1つの断片になり、role が 'body' の項目が本文、それ以外は extras として添える。
 */
export interface UnitRule {
  selector: string; // カンマ区切りで複数指定可（例: '#master, td.rtd'）
  anchorSelector?: string; // レス番号など。テキストを anchor に保存する
  permalinkSelector?: string; // この要素（または最も近い a）の href を permalink に保存する
  fields: FieldRule[];
}

export interface SiteProfile {
  id: string;
  name: string;
  builtIn: boolean;
  builtInVersion?: number;
  enabled: boolean;
  modified?: boolean; // 組み込みプロファイルをユーザーが編集したか（更新時に上書きしない）
  urlPatterns: string[]; // 'host/path' 形式。* は1階層、** は任意（例: 'github.com/*/*'）
  priority: number;
  fields: FieldRule[];
  unit?: UnitRule;
  createdAt: number;
  updatedAt: number;
}

export interface PromptTemplate {
  id: string;
  name: string;
  body: string;
  builtIn: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  locale: 'auto' | 'ja' | 'en';
  articleMaxChars: number | null; // 汎用本文の文字数上限（null = 無制限）
  pinnedFirst: boolean; // ピン留めを一覧の先頭に表示する
  listStyle: 'compact' | 'card'; // 管理タブの一覧表示
  contextMenu: boolean; // 右クリックメニューに「ScrapAIに保存」を出す（既定オフ。contextMenus権限が必要）
  cardColumns: number; // カード表示の列数（0 = 自動、1〜6）
  aiTemplateId: string; // 最後に使ったAIテンプレート（P4）
  aiApplyHeadline: boolean; // 回答を保存したとき、見出しでタイトルを置き換える（既定オン）
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'auto',
  articleMaxChars: 3000,
  pinnedFirst: true,
  listStyle: 'compact',
  cardColumns: 0,
  contextMenu: false,
  aiTemplateId: 'builtin-verify',
  aiApplyHeadline: true,
};

// 保存処理の結果（背景ページ → ポップアップ）
export type SaveMode = 'auto' | 'reextract' | 'separate';

export interface SaveOutcome {
  kind: 'created' | 'fragment-added' | 'duplicate-fragment' | 'already-saved' | 'failed';
  scrapId?: string;
  title?: string;
  extractStatus?: ExtractStatus;
  fragmentCount?: number; // 保存後の断片の総数
  addedFragmentIds?: string[]; // 今回追加した断片（取り消し用）
  error?: string;
}
