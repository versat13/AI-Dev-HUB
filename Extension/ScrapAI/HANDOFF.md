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

## 現在の状態（v1.0.6）
- P0〜P5 完了。ユニットテスト108件、e2e（ui/profiles/ai/data）全通過。`npm run test:e2e`で一括実行。
- P1：保存（URL+タイトルを先に確定、抽出失敗でも残る）、重複検出、範囲選択の断片追加、取り消し。
- P2：ポップアップ=一覧+「このページをスクラップ」ボタン。サイドパネル=一覧+詳細（保存ボタンなし）。管理タブ=一覧/詳細/絞り込み/一括操作/カテゴリ/設定。
- P4：AIテンプレート（組み込み3種+自作）、プロンプトをコピー/ChatGPT・Claude・Geminiを開く（自動入力・送信なし）、回答の貼り付け→固定見出しで構造化（原文は常に保存）、AI要約あり/なし連動、検索対象。
- P5：設定画面でエクスポート/インポート（JSON、`scrapai-export` v1）。含める内容を選択（星・ピン・カテゴリ既定ON）、重複はスキップ（既定）/上書き/別項目、不正ファイルは何も書き込まず拒否。
- 日本語訳：テンプレート「日本語に訳す」→回答の「日本語タイトル」「日本語訳」を「日本語訳を適用」でタイトル（元は`originalTitle`に保持、戻せる）と訳文の断片(source=translation)に反映。検索は両方のタイトル対象。
- P3：サイト別プロファイル（X・GitHub・ふたば）、複数断片、文字数上限、ユーザー編集、要素ピッカー、サイト設定画面。

## 次にやること（優先順）
1. P6：ショートカット/右クリック（既定は無効）、アイコン本番化、プライバシーポリシー、ストア審査対応。

## 注意・落とし穴
- activeTab はアイコンをクリックしたタブにだけ付与される → サイドパネルには保存ボタンを置けない。
- IndexedDBは boolean/null をインデックスできない → pinned/archived はメモリ内フィルタ。
- 抽出テキストは必ずプレーンテキストで表示（HTMLとして解釈しない）。
- i18n文言（_locales/*/messages.json）に `*/` を書かない（WXTが生成する型定義が壊れる）。
- 組み込みプロファイルのセレクタはサイト側の変更で合わなくなる。合わなければ汎用抽出に自動で切り替わる。GitHubは実ページ未確認。
- 拡張機能の名前を変えるとフォルダ名・拡張機能IDが変わり、IndexedDBのデータは引き継がれない（P5のエクスポートで移行）。

- ロケールのキーは `[A-Za-z0-9_@]` のみ（ハイフン不可。守らないとChromeが拡張を読み込めない）。locales.test.tsで検査。
- e2eはクラッシュしてもgrepで0件に見えることがある。`passed`行の有無まで確認する。

## 未確認
- AIサイト（ChatGPT/Claude/Gemini）への実際の貼り付け操作、実機でのクリップボード動作。
- 実機でのツールバークリックによる activeTab 付与、ポップアップからの sidePanel.open の動作。
- GitHub（リポジトリ/Issue）の既定セレクタ。

## 作品ルール
### 配布ZIP
- 名前：`ScrapAI-v<MAJOR>.<MINOR>.<PATCH>.zip`（リリースごとに PATCH を +1。MAJOR/MINORは指示時のみ）
- 中身は `ScrapAI/`（ビルド済み拡張、Chromeで読み込む。フォルダ名は変えない）と `ScrapAI-source/`（ソース。node_modules等は除く）
- ZIP作成時、`wxt.config.ts` と `package.json` の version もZIP名に合わせる。
### 進め方
- コードを書く前に方針を示し、許可を得る。完了後は指示があるまで次の作業に進まない。
- 応答は日本語・簡潔・結論から。
