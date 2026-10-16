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
- e2e：Playwright + 同梱のChromiumに拡張を読み込む（リポジトリには含めていない。localhost用の host_permissions を足したビルドの複製で行う）。

## 現在の状態（v1.0.3）
- P0〜P3 完了。ユニットテスト87件、e2e（ポップアップ/管理/サイドパネル/サイト別抽出）全通過。
- P1：保存（URL+タイトルを先に確定、抽出失敗でも残る）、重複検出、範囲選択の断片追加、取り消し。
- P2：ポップアップ=一覧+「このページをスクラップ」ボタン。サイドパネル=一覧+詳細（保存ボタンなし）。管理タブ=一覧/詳細/絞り込み/一括操作/カテゴリ/設定。
- P3：サイト別プロファイル（X・GitHub・ふたば）、複数断片、文字数上限、ユーザー編集、要素ピッカー、サイト設定画面。

## 次にやること（優先順）
1. P4：AI連携（プロンプト生成→コピー/AIサイトを開く、AI回答の貼り付け保存、固定Markdown形式の解析、原文は必ず保存）。
2. P5：エクスポート/インポート（含める内容を選択、星・ピン・カテゴリは既定で含める）。
3. P6：ショートカット/右クリック（既定は無効）、アイコン本番化、プライバシーポリシー、ストア審査対応。

## 注意・落とし穴
- activeTab はアイコンをクリックしたタブにだけ付与される → サイドパネルには保存ボタンを置けない。
- IndexedDBは boolean/null をインデックスできない → pinned/archived はメモリ内フィルタ。
- 抽出テキストは必ずプレーンテキストで表示（HTMLとして解釈しない）。
- i18n文言（_locales/*/messages.json）に `*/` を書かない（WXTが生成する型定義が壊れる）。
- 組み込みプロファイルのセレクタはサイト側の変更で合わなくなる。合わなければ汎用抽出に自動で切り替わる。GitHubは実ページ未確認。
- 拡張機能の名前を変えるとフォルダ名・拡張機能IDが変わり、IndexedDBのデータは引き継がれない（P5のエクスポートで移行）。

## 未確認
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
