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
  aiExcerpt?: string; // 最新のAI回答の要点（一覧で「AI要約」を主役にするとき使う）
  aiHeadline?: string; // 最新のAI回答の見出し（同上。タイトル自体は書き換えない）
  translation?: ScrapTranslation; // カードの翻訳（Chrome内蔵の翻訳機能。元の文は書き換えない）
  createdAt: number;
  updatedAt: number;
}

export interface ScrapTranslation {
  lang: string; // 訳した先の言語
  title: string;
  excerpt: string;
  on: boolean; // 訳文を表示しているか
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
  updatedAt?: number; // 別の項目へ移したときなど（同期でどちらが新しいかを決める）
}

export type AiParseStatus = 'ok' | 'partial' | 'failed';

export interface AiAnswer {
  id: string;
  scrapId: string;
  fragmentIds?: string[];
  service?: string; // AIサービスのID（'chatgpt' など。自作サービスや 'gemini-api' も入る）
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

/**
 * スナップショット（ページの一部の画像）の撮り方。サイトごとに持つ。
 * selector が '@unit' のときは、保存した単位（Xの投稿など）そのものを撮る。
 * when を指定すると、その要素が範囲内にあるときだけ撮れる（画像・動画・引用があるときなど）。
 */
export interface SnapshotRule {
  mode: 'off' | 'ask' | 'auto';
  selector: string;
  when?: string;
}

export interface Snapshot {
  id: string;
  scrapId: string;
  blob: Blob; // WebP。画面に見えていた範囲だけ
  width: number;
  height: number;
  createdAt: number;
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
  snapshot?: SnapshotRule;
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

/** 「聞く」相手のAIサービス。標準のものも設定から変えられる（入力欄などの場所は空なら自動で探す） */
export interface AiServiceCfg {
  id: string;
  name: string;
  url: string;
  tempUrl?: string; // 一時チャットで開くURL（あれば）
  builtIn: boolean;
  composerSel?: string; // 入力欄のCSSセレクタ（空 = 自動）
  sendSel?: string; // 送信ボタン（空 = 自動）
  answerSel?: string; // 回答の場所（空 = 自動）
  autoSend: boolean; // 入れたあと自動で送信する（AIボタンでは常に送信する）
  closeOnDone: boolean; // AIボタンで取り込みに成功したらタブを閉じる
  background?: boolean; // AIボタンで裏のタブで開く（未指定=はい）。裏だと送信が効かないサービスは手前で開く
}

/** AIボタンの送り先: AIサービスのID、または Gemini API（タブを開かない） */
export const GEMINI_API = 'gemini-api';

/** 一覧の表示: コンパクト（1行）/ カード（3行）/ カード（大、10行まで） */
export type Density = 'compact' | 'card' | 'large';

export interface Settings {
  locale: 'auto' | 'ja' | 'en';
  theme: 'light' | 'dark' | 'auto'; // 既定はライト
  articleMaxChars: number | null; // 汎用本文の文字数上限（null = 無制限）
  pinnedFirst: boolean; // ピン留めを一覧の先頭に表示する
  listStyle: Density; // 管理タブの一覧表示
  pageSize: number; // 管理タブの一覧の1ページの件数（既定50）
  listSnapshots: boolean; // 管理タブのカードにスナップショットを出す

  contextMenu: boolean; // 右クリックメニューに「ScrapAIに保存」を出す（既定オフ。contextMenus権限が必要）
  panelKeepOpen: boolean; // サイドパネルを自動で閉じない
  aiTemporaryChat: boolean; // AIサービスは一時チャットで開く
  aiDirect: boolean; // AIサービスの入力欄に自動で入れ、回答を取り込むボタンを出す（初回にアクセスを許可）
  aiAutoSend: boolean; // 入れたあと自動で送信する
  listFace: 'ai' | 'original'; // 一覧の表示: AI要約を主役にするか、元の内容か
  cardColumns: number; // カード表示の列数（0 = 自動、1〜6）
  aiTemplateId: string; // 最後に使ったAIテンプレート（P4）
  aiServices: AiServiceCfg[] | null; // 設定したAIサービス（null = 標準の3つ）
  aiButtonService: string; // AIボタンの送り先（サービスID または 'gemini-api'）
  aiButtonTemplateId: string; // AIボタンで使うプロンプト
  geminiModel: string; // Gemini API のモデル名
  aiPromptLang: 'en' | 'native'; // プロンプトの指示文: 英語（回答は表示言語）か、表示言語そのまま
  aiApplyHeadline: boolean; // 回答を保存したとき、見出しでタイトルを置き換える（既定オン）
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'auto',
  theme: 'light',
  articleMaxChars: 1000,
  pinnedFirst: true,
  listStyle: 'compact',
  pageSize: 50,
  listSnapshots: false,
  cardColumns: 0,
  panelKeepOpen: false,
  aiTemporaryChat: true,
  aiDirect: true,
  aiAutoSend: false,
  listFace: 'ai',
  contextMenu: false,
  aiTemplateId: 'builtin-summary',
  aiApplyHeadline: true,
  aiPromptLang: 'en',
  aiServices: null,
  aiButtonService: 'chatgpt',
  aiButtonTemplateId: 'builtin-summary',
  geminiModel: 'gemini-3.8',
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
  snapshot?: 'available' | 'taken' | 'failed';
  addedSnapshotId?: string; // 今回撮ったスナップショット（取り消し用） // スナップショット: 撮れる / 自動で撮った / 失敗
  error?: string;
}
