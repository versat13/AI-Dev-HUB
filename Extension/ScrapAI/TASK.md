# ScrapAI 作業指示書（作成：Opus 5.5 / 2026-10-18）
状態：完了（Opus 5.5 確認済み）
<!-- Opusが書く。実装するAIは「状態」と「結果」だけを更新する。 -->

## やること（v1.3.7）
1. カード表示で下段（出典・状態・星・カテゴリ）がカードの外へはみ出すのを直す。
   - 原因：`.meta-src`・`.stars`・`.meta-cats` が `flex: none` の固定幅で、幅240pxのカードでは合計がカード幅を超える。
   - 直し方：`src/ui/ui.css` に **`.rows.grid` に限った上書き** を足す。下段を折り返せるようにし（`flex-wrap: wrap`）、出典は縮められるようにする（幅は今の値を上限、`min-width: 0` で省略記号）。カテゴリは幅を `auto`・`max-width: 100%`・`margin-left: auto` にして、入らなければ次の行の右端へ回す。
   - コンパクト表示（`.rows` で `.grid` なし）の見た目と位置そろえは変えない（`e2e/ui.mjs` の「下段: 状態・星・カテゴリの位置がどのカードでもそろい…」が検査している）。
2. `src/public/_locales/ja/messages.json` の `geminiApiName` を「Gemini API」に、`en` を「Gemini API」にする（括弧書きを削る）。
3. 版を 1.3.7 に：`package.json`・`wxt.config.ts` の version。

## 触ってよいファイル
- `src/ui/ui.css`（上記1。既存行は変えず、`.rows.grid` の上書きを近くに追記）
- `src/public/_locales/ja/messages.json`、`src/public/_locales/en/messages.json`（`geminiApiName` の1行ずつ）
- `package.json`、`wxt.config.ts`（version のみ）
<!-- ここにないファイルの変更が必要になったら、止まって報告する。release/ と HANDOFF/log は Opus が更新する。 -->

## 触ってはいけないもの
- 設計ファイル（AGENTS.md の権限表を参照）、`ListBrowser.tsx` の幅計算、`release/`

## 完了条件
- [x] `npx tsc --noEmit` が通る
- [x] `npx vitest run` が全件通る
- [x] `npx wxt build` が通る
- [x] 幅240pxのカードで、カテゴリ「サンプル」などがカードの枠内に収まる（Opusがプレビューで確認）

## 結果（実装したAIが書く）
- 変更したファイル：src/ui/ui.css（`.rows.grid` 直後に上書き3行を追記、既存行は未変更）、src/public/_locales/ja・en/messages.json（geminiApiName を「Gemini API」に）、package.json・wxt.config.ts（version 1.3.7）
- 確認したこと：`npx tsc --noEmit` 通過、`npx vitest run` 18ファイル163件全通過、`npx wxt build` 成功（node_modules が無かったため `npm ci` を先に実行）
- Opus追記：カードで「✦ AI要約 1件」が「✦ A」に潰れていたため `.rows.grid .meta-flags { flex: 1 0 auto; }` を1行追加。Webプレビューで6枚とも下段が枠内に収まることを確認。
- 未確認：幅240pxのカードでの実表示（Opusがプレビューで確認）、e2e は未実行
