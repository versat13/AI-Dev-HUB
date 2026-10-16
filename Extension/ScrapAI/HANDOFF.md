# ScrapAI 引き継ぎ（2026-10-16）
種別：extension（Chrome MV3）

## 目的と方針
ページ・X投稿・GitHubリポジトリ・掲示板スレ（ふたば）をローカルに保存し、後で思い出す／AIに解説させる。
仕様書：（非公開）（12章、P0〜P6）
- Chrome Syncは使わない。データは全てIndexedDB（端末内）。移行用にエクスポート/インポートを作る（P5）。
- 保存はボタンを押したときだけ。保存時にAIへ問い合わせない。AI回答は手動（コピー/貼り付け）で取り込む。
- 権限は activeTab / scripting / storage / unlimitedStorage / sidePanel のみ。host_permissions は宣言しない。

## 環境
- WXT 0.21 + Preact + TypeScript(strict) + Dexie 4 + @mozilla/readability + Vitest。
- 準備：`npm install` → `npx wxt prepare`。確認：`npx tsc --noEmit` / `npx vitest run` / `npx wxt build`（出力 dist/chrome-mv3）。
- ビルドは `wxt.config.ts` の hook で host_permissions を削除している（消さないこと）。
- e2e：`e2e/*.mjs`（Playwright+Chromium、localhost用host_permissionsを足した複製で実行）。ヘッドレスでは拡張ページにクリップボード権限を付けられないため、ai.mjsはclipboardを代役に差し替えている。

## 現在の状態（v1.0.11）
- P0〜P6 完了（ストア申請の素材を除く）。ユニットテスト137件、e2e（ui/profiles/ai/data/snapshot）全通過。`npm run test:e2e`で一括実行。
- P1：保存（URL+タイトルを先に確定、抽出失敗でも残る）、重複検出、範囲選択の断片追加、取り消し。
- P2：ポップアップ=一覧+「このページをスクラップ」ボタン。サイドパネル=一覧+詳細（保存ボタンなし）。管理タブ=一覧/詳細/絞り込み/一括操作/カテゴリ/設定。
- P4：AIテンプレート（組み込み3種+自作）、プロンプトをコピー/ChatGPT・Claude・Geminiを開く（自動入力・送信なし）、回答の貼り付け→固定見出しで構造化（原文は常に保存）、AI要約あり/なし連動、検索対象。
- P5：設定画面でエクスポート/インポート（JSON、`scrapai-export` v1）。含める内容を選択（星・ピン・カテゴリ既定ON）、重複はスキップ（既定）/上書き/別項目、不正ファイルは何も書き込まず拒否。
- 日本語訳：テンプレート「日本語に訳す」→回答の「日本語タイトル」「日本語訳」を「日本語訳を適用」でタイトル（元は`originalTitle`に保持、戻せる）と訳文の断片(source=translation)に反映。検索は両方のタイトル対象。
- P6：ショートカット（`commands`登録のみ・キー未割り当て、保存時はアイコンに✓バッジ）、右クリック「ScrapAIに保存」（設定でオン時のみ`contextMenus`任意権限を要求）、本番アイコン、`PRIVACY.md`、`STORE.md`。カード表示は列数を自動/1〜6で選択（`cardColumns`）。
- v1.0.8 UI刷新：紙(#f6f7f9)+紺インク3段階の強弱、黄色はAI専用。一覧は「あるものだけ表示」（未評価・AIなしは出さない）、相対日付、ドメイン頭文字の印。管理はサイドバー（一覧/アーカイブ/カテゴリ件数）＋絞り込みポップ＋有効条件チップ。詳細は本文/AIタブ、操作は「…」メニュー。AIは①聞く②貼る。
- 見出し：全テンプレートの先頭に「## 見出し」。回答保存時にタイトルを自動置換（設定`aiApplyHeadline`、既定ON）。手でタイトルを編集すると`originalTitle`を消し、そのタイトルが基準になる。旧`jaTitle`も読める。
- v1.0.11：
  - プロンプト（旧AIテンプレート、英語 Prompts）：要約（既定）/要点抽出/情報の精査/手順確認/導入判断。構成は「役割→<material>資料→やること→回答の形式」（長文を先・指示を後、資料はタグで囲む、「資料に記載なし」を許可、精査は引用で根拠）。
  - 一覧：「AI要約」表示はタイトルも最新回答の見出し（`aiHeadline`、DB v4）。カード（大）を追加（`Density`）。下段は 出典（表示中の最長ドメイン幅）/状態/カテゴリ右寄せ/星5つ分の幅固定、保存日時は詳細のみ。
  - タイトル整形 `cleanPageTitle`：末尾のサイト名を除去、タイトルが本文を含むなら本文の最初の一文。
  - サイドパネルのピンは削除し、設定「サイドパネルを自動で閉じない」へ。ポップアップの注意書き削除。管理画面は右側だけスクロール。
- v1.0.10：
  - EN方式は見出し・項目名も英語に統一（`headLang = bodyLang`）。画面の見出しは表示言語。翻訳テンプレートは廃止（旧回答は読める）。新テンプレート「使うべきか判断する」（pros/risks/alternatives/verdict）。
  - 一時チャット（`aiTemporaryChat` 既定ON）：ChatGPT `?temporary-chat=true`、Claude `/new?incognito`（未確認）、Geminiは通常。`serviceUrl()`。
  - 一覧の表示切替「AI要約/原文」（`listFace`）。最新回答の要点を `scraps.aiExcerpt` に保持（DB v3で既存分を生成）。
  - カード・詳細の翻訳：Chrome内蔵 Translator/LanguageDetector（Chrome 138+、端末内）。カードの訳は `scraps.translation` に保存、詳細の本文訳は表示のみ。使えない環境ではボタンを出さない。
  - サイドパネル：自前の見出しを削除（Chromeが出す）、フォーカスが外れたら自動で閉じる（「開いたままにする」`panelKeepOpen`）。
  - 削除は2回押し（1回目でボタンが「もう一度押すと削除」に変わる、3秒で戻る）。右クリックメニューの作り直しを直列化（duplicate id 修正）。
  - 設定画面をカード化、データはエクスポート/インポートを対のカードに。サイト一覧のみスクロール。テンプレートは見出し構成つきのカード。アイコン刷新。
- v1.0.9：
  - プロンプト言語：既定はEN（指示英語＋回答は表示言語、見出しは表示言語）、AI欄の「EN/日本語」で切替（`aiPromptLang`）。回答はコードブロックで出させ、パーサは囲みを除去・記号なしの正式見出し行も認識。
  - スナップショット：`SiteProfile.snapshot {mode off/ask/auto, selector('@unit'可), when}`。抽出時に範囲へ`data-scrapai-snap`を付け、backgroundが`captureVisibleTab`→OffscreenCanvasで切り抜きWebPを`snapshots`表（DB v2）へ。新規保存・断片追加のときだけ撮る。Xは画像/動画/カード/引用があるとき「たずねる」。
  - 組み込み追加（BUILTIN_VERSION 2、実ページ未確認）：Zenn, Qiita, note, はてなブログ, DEV, Medium, Wikipedia, Stack Overflow系, Reddit, Hacker News, Bluesky, YouTube。
  - 削除は「…」メニューと一括操作「その他」に確認付き（ConfirmDelete）。カテゴリはワンタップ、並び順にドメイン順、サイドパネルはカード表示。
- P3：サイト別プロファイル（X・GitHub・ふたば）、複数断片、文字数上限、ユーザー編集、要素ピッカー、サイト設定画面。

## 次にやること（優先順）
1. 実機確認の結果を受けた修正。
2. ストア申請の素材：スクリーンショット（1280×800）、プロモ画像、プライバシーポリシーの公開URL（STORE.md参照）。

## 注意・落とし穴
- activeTab はアイコンをクリックしたタブにだけ付与される → サイドパネルには保存ボタンを置けない。
- IndexedDBは boolean/null をインデックスできない → pinned/archived はメモリ内フィルタ。
- 抽出テキストは必ずプレーンテキストで表示（HTMLとして解釈しない）。
- i18n文言（_locales/*/messages.json）に `*/` を書かない（WXTが生成する型定義が壊れる）。
- 組み込みプロファイルのセレクタはサイト側の変更で合わなくなる。合わなければ汎用抽出に自動で切り替わる。GitHubは実ページ未確認。
- 拡張機能の名前を変えるとフォルダ名・拡張機能IDが変わり、IndexedDBのデータは引き継がれない（P5のエクスポートで移行）。

- ロケールのキーは `[A-Za-z0-9_@]` のみ（ハイフン不可。守らないとChromeが拡張を読み込めない）。locales.test.tsで検査。
- e2eはクラッシュしてもgrepで0件に見えることがある。`passed`行の有無まで確認する。

- 見出しの別名に「タイトル」「title」のような汎用語を足さない（本文中の行を見出しと誤認する）。

- 「次から自動で撮る」を選ぶと組み込みプロファイルが「編集済み」になり、以後の組み込み更新が当たらない（既定に戻すで解除）。
- e2e/snapshot.mjs はテスト用の複製に `<all_urls>` を足している（メッセージ保存では activeTab が付かないため）。

## 未確認
- サイドパネルの自動クローズは、パネルを一度操作（フォーカス）してからページに戻ったときに働く（ポップアップから開いて一度も触らない場合は閉じない）。Chromeの翻訳機能の実機動作、Claudeの`?incognito`。
- 追加した各サイトのセレクタ、Xでのスナップショット（固定ヘッダーとの重なり、長い投稿の下切れ）、実際のAIがコードブロックで返すか。
- 右クリックメニューのオン（許可ダイアログ）と実際の表示、ショートカットキー割り当て後の保存（ヘッドレスe2eでは確認できない）。
- AIサイト（ChatGPT/Claude/Gemini）への実際の貼り付け操作、実機でのクリップボード動作。
- 実機でのツールバークリックによる activeTab 付与、ポップアップからの sidePanel.open の動作。
- GitHub（リポジトリ/Issue）の既定セレクタ。

## 作品ルール
### 配布（GitHub）
- ZIPは作らない。ビルド済み拡張を `Extension/ScrapAI/release/ScrapAI/` にcommitして渡す（フォルダ名は変えない。常に最新版を上書き）。
- 手順：`npx wxt build` → `release/ScrapAI` を `dist/chrome-mv3` で置き換え → HANDOFF/log更新 → commit・push。
- 納品の報告は1行：`https://github.com/versat13/AI-Dev-HUB/tree/main/Extension/ScrapAI/release/ScrapAI`（vX.Y.Z）。ユーザーはcloneしているので、pullしてChromeで「再読み込み」する。
- バージョンはリリースごとに PATCH を +1（MAJOR/MINORは指示時のみ）。`wxt.config.ts` と `package.json` の version を揃え、`release/ScrapAI/manifest.json` の version と一致させる。
### 進め方
- コードを書く前に方針を示し、許可を得る。完了後は指示があるまで次の作業に進まない。
- 応答は日本語・簡潔・結論から。
