# ScrapAI 引き継ぎ（2026-10-18）
種別：extension（Chrome MV3）。版ごとの詳細・未確認の全件は `PROGRESS.md`。

## 目的と方針
ページ・X投稿・GitHubなどをローカルに保存し、後で思い出す／AIに解説させる。
- Chrome Sync不使用。データは全てIndexedDB（端末内）。移行はJSONエクスポート/インポート、PC間は同期フォルダ。
- 保存はボタンを押したときだけ。保存時にAIへ問い合わせない。
- 権限は activeTab / scripting / storage / unlimitedStorage / sidePanel のみ。host_permissions は宣言しない（AIサービス等は optional_host_permissions で都度要求）。

## 環境（コマンドは `Extension/ScrapAI/` で実行）
- WXT 0.21 + Preact + TypeScript(strict) + Dexie 4 + @mozilla/readability + Vitest。
- 準備：`npm install`。確認：`npx tsc --noEmit` / `npx vitest run` / `npx wxt build`（出力 dist/chrome-mv3）/ `npm run test:e2e`。
- ビルドは `wxt.config.ts` の hook で host_permissions を削除している（消さないこと）。
- e2e：`e2e/*.mjs`（Playwright+Chromium、localhost用host_permissionsを足した複製で実行）。ai.mjsはclipboardを代役に差し替え。
- Webプレビュー（AI Studio用）：リポジトリ直下で `npm run dev`（ポート3000）。`src/lib/browser-shim.ts` が chrome API を代役する。拡張のビルドには含まれない。

## 現在の状態（v1.3.6）
- P0〜P6 完了（ストア申請の素材を除く）。ユニットテスト163件・e2e全通過。
- AI連携：AIボタン（裏タブで入力・送信・回答取り込み）、Gemini API直接呼び出し（キーは storage.local、既定モデル gemini-3.8）、標準サービス ChatGPT/Claude/Gemini/Grok/Perplexity。
- 直近：v1.3.6 回答の予備探索は100字以上のみ採用（Grokの「考え中」表示対策）。v1.3.5 Grok対応（取り込みは実機未確認）。

## 次にやること（優先順）
1. 実機確認の結果を受けた修正（実際のAIサイトでの自動入力・取り込み、同期フォルダ、Gemini APIキー）。
2. ストア申請の素材：スクリーンショット（1280×800）、プロモ画像、プライバシーポリシーの公開URL（STORE.md参照）。

## 注意・落とし穴
- Gemini APIの「AQ.」形式キーは実キーで未確認（RESTで拒否される報告あり）。Grok/Perplexityの自動検出も実サイト未確認。
- activeTab はアイコンをクリックしたタブにだけ付与される → サイドパネルには保存ボタンを置けない。
- IndexedDBは boolean/null をインデックスできない → pinned/archived はメモリ内フィルタ。
- 抽出テキストは必ずプレーンテキストで表示（HTMLとして解釈しない）。
- ロケールのキーは `[A-Za-z0-9_@]` のみ（ハイフン不可、locales.test.tsで検査）。文言に `*/` を書かない（WXTの型定義が壊れる）。
- 見出しの別名に「タイトル」「title」のような汎用語を足さない（本文中の行を見出しと誤認する）。
- 組み込みプロファイルのセレクタはサイト変更で合わなくなる（汎用抽出に自動で切替）。「次から自動で撮る」を選ぶと組み込みが「編集済み」になり更新が当たらない。
- 拡張機能の名前を変えると拡張機能IDが変わり、IndexedDBのデータは引き継がれない。
- 設定の入力欄は確定時保存の `CommitInput`（再描画で入力が消えないように）。
- e2eは `wxt build` し直してから実行する（古いdistで通ったように見える）。クラッシュしてもgrepで0件に見えるので `passed` 行まで確認。各mjsの先頭で初回サンプルを消す。snapshot.mjs は複製に `<all_urls>` を足している。

## 未確認（主なもの。全件は PROGRESS.md）
- 実際のAIサイトでの裏タブ送信・回答取り込み、実機のクリップボード、Gemini APIの実呼び出し。
- 実機のactiveTab付与・sidePanel.open、右クリックメニュー、ショートカットキー、GitHubの既定セレクタ。

## 作品ルール
### 配布（GitHub）
- ZIPは作らない。ビルド済み拡張を `Extension/ScrapAI/release/ScrapAI/` にcommitして渡す（フォルダ名は変えない。常に最新版を上書き）。
- 手順：`npx wxt build` → `release/ScrapAI` を `dist/chrome-mv3` で置き換え → HANDOFF/log更新 → commit・push。
- 納品の報告は1行：`https://github.com/versat13/AI-Dev-HUB/tree/main/Extension/ScrapAI/release/ScrapAI`（vX.Y.Z）。ユーザーはpullしてChromeで「再読み込み」する。
- バージョンはリリースごとに PATCH を +1（MAJOR/MINORは指示時のみ）。`wxt.config.ts`・`package.json`・`release/ScrapAI/manifest.json` の version を一致させる。
### 進め方
- コードを書く前に方針を示し、許可を得る。完了後は指示があるまで次の作業に進まない。
- 応答は日本語・簡潔・結論から。
