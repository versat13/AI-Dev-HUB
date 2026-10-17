# ScrapAI 引き継ぎ（2026-10-17）
種別：extension（Chrome MV3）

## 目的と方針
ページ・SNS投稿・GitHub等をローカル（IndexedDB）に保存し、後で思い出す／AIに解説・要約させる。
- Chrome Sync不使用。データは全て端末内（移行はJSONエクスポート/インポート）。保存は手動実行時のみ。
- 権限は activeTab / scripting / storage / unlimitedStorage / sidePanel のみ（host_permissionsなし）。

## 環境・コマンド
- 構成：WXT 0.21 + Preact + TypeScript(strict) + Dexie 4 + Vite
- 開発サーバー：`npm run dev`（ポート3000・Webプレビュー起動）
- テスト：`npm test`（Vitest 18ファイル・164件全通過）
- ビルド：`npm run build`（Webビルド）、拡張ビルドは `cd Extension/ScrapAI && npx wxt build`

## 現在の状態（v1.3.6）
- P0〜P6 完了（保存、断片追加、重複検出、一覧/詳細、カテゴリ、サイト別設定、プロンプト、AI要約・見出し置換、同期、スナップショット）。
- AI連携：Gemini API（直接呼出、キーは端末local、モデル gemini-3.8）＋Webサービス（ChatGPT/Claude/Gemini/Grok/Perplexity）裏タブ連携。
- AI Studio対応：browser-shim によりブラウザ上で管理画面・ポップアップ・サイドパネルをプレビュー可能。

## 次にやること
1. 実機ChromeでのAI連携（裏タブ自動入力/取り込み、Gemini APIキー）の実動作確認。
2. ストア申請素材の作成（スクリーンショット 1280×800、STORE.md参照）。

## 注意・落とし穴
- activeTab は拡張アイコン押下タブにのみ付与（サイドパネルに直接保存ボタンは置けない）。
- IndexedDB は boolean/null をインデックス不可（pinned/archived はメモリ内フィルタ）。
- ロケールキー（messages.json）は `[A-Za-z0-9_@]` のみ（ハイフン不可）。文言に `*/` を書かない。
- 抽出テキストは常にプレーンテキスト表示。

## 作品ルール
- 配布：ZIPは作らず、ビルド済み成果物を `release/ScrapAI/` にコミットして渡す。
- バージョン：リリースごとに PATCH +1。`wxt.config.ts`, `package.json`, `release/ScrapAI/manifest.json` を一致させる。
- コード変更前に方針を示し許可を得る。応答は日本語・簡潔・結論から。
