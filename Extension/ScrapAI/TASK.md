# ScrapAI 作業指示書（作成：Opus 5.5 / 2026-10-18）
状態：完了（Opus 5.5 確認。e2e の実行は未確認）
<!-- Opusが書く。実装するAIは「状態」と「結果」だけを更新する。 -->

## やること（e2e を Windows でも動かす。拡張本体の版は上げない）
1. `e2e/*.mjs`（7ファイル）の `new URL(import.meta.url).pathname` を `fileURLToPath(import.meta.url)` に置き換える。
   - 原因：Windows では pathname が `/C:/...` になり、`path.join` で `C:\C:\...` になって `.out` が作れない。
   - 各ファイルの import 群に `import { fileURLToPath } from 'node:url';` を1行足す。9行目（HERE）と12行目（PROFILE）の2か所が対象。
2. 他に Windows で動かない箇所が見つかったら、直さずに結果欄に書いて止まる。

## 触ってよいファイル
- `e2e/ai.mjs`, `e2e/bridge.mjs`, `e2e/data.mjs`, `e2e/profiles.mjs`, `e2e/snapshot.mjs`, `e2e/sync.mjs`, `e2e/ui.mjs`（上記の置き換えだけ）

## 触ってはいけないもの
- 設計ファイル（AGENTS.md の権限表を参照）、`src/`、`release/`、`package.json`

## 完了条件
- [x] 7ファイルとも `node --check e2e/<名前>.mjs` が通る
- [x] `grep -n "import.meta.url).pathname" e2e/*.mjs` が0件
- [ ] e2e 一式が Windows で通る（Chromium 導入後に Opus が実行）

## 結果（実装したAIが書く）
- 変更したファイル：e2e/ai.mjs, bridge.mjs, data.mjs, profiles.mjs, snapshot.mjs, sync.mjs, ui.mjs（各ファイルで import 1行追加と HERE・PROFILE の2か所を置き換え）
- 確認したこと：7ファイルとも node --check 通過。grep "import.meta.url).pathname" は0件。他にWindowsで動かない箇所は調べていない（コードを読んだだけで実行していない）
- 未確認：e2e 一式の実行（Chromium 未導入のため未実行。Opusが実行）
- Opus追記：パスは正しく解決するようになった（起動コマンドの .ext・.profile-ui が正しい絶対パスになる）。Chromium（chromium-1248）は導入済みだが、Claude Code のセッション内からは chrome.exe を起動できない（spawn UNKNOWN／サイドバイサイド構成エラー）。e2e は利用者のターミナルで `npm run test:e2e` を実行して確認する。

## 履歴
- v1.3.7（2026-10-18 完了）：カード表示の下段はみ出し修正、「Gemini API」に改名。Sonnet実装、Opusが `.meta-flags` の1行を追加して確認。
