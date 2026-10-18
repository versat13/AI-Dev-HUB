# ScrapAI 作業指示書（作成：Opus 5.5 / 2026-10-18）
状態：完了（Opus 5.5 確認。e2e は利用者の環境で全通過：226件）
<!-- Opusが書く。実装するAIは「状態」と「結果」だけを更新する。 -->

## やること（v1.3.8。e2e の失敗2件の修正）
1. 拡張機能自身のページなどを保存しない。
   - 原因：新しいChromeは自分の拡張ページ（`chrome-extension://...`）のURLも返すため、`src/lib/save.ts` の `saveFromPage` の「URLなし→failed」をすり抜け、「__MSG_actionTitle__」という項目ができる。
   - 直し方：`saveFromPage` 冒頭で、URLのプロトコルが `http:`・`https:`・`file:` 以外（URLとして解釈できないものも）なら `{ kind: 'failed', error: 'no-url' }` を返し、DBに何も書かない。
   - `src/lib/save.test.ts` に1件追加：`chrome-extension://abc/manager.html` で failed（error 'no-url'）になり、scraps が0件のまま。
2. コンパクト表示（ポップアップ・サイドパネル・管理画面）で、翻訳ボタンが出る行だけ下段（星・カテゴリ）が左にずれるのを直す。
   - 原因：`ScrapRow.tsx` の翻訳ボタン `.row-tr`（28px＋右余白6px）が行内の flex 要素なので、出る行だけ `.row-main` が狭くなる。
   - 直し方：`ScrapRow.tsx` で、`showTranslate` が false でも `canTranslate()` が true なら、翻訳ボタンと同じ位置に空き枠 `<span class="row-tr-slot" aria-hidden="true" />` を出す。`ui.css` に `.row-tr-slot { flex: none; width: 28px; margin: 8px 6px 0 0; }` と `.rows.grid .row-tr-slot { display: none; }` を足す（`.row-tr` の近く）。
3. 版を 1.3.8 に：`package.json`・`wxt.config.ts` の version。

## 触ってよいファイル
- `src/lib/save.ts`、`src/lib/save.test.ts`（上記1）
- `src/ui/ScrapRow.tsx`、`src/ui/ui.css`（上記2。既存の行は変えずに追記）
- `package.json`、`wxt.config.ts`（version のみ）

## 触ってはいけないもの
- 設計ファイル（AGENTS.md の権限表を参照）、`release/`、`e2e/`、HANDOFF.md、log/

## 完了条件
- [ ] `npx tsc --noEmit` が通る
- [ ] `npx vitest run` が全件通る（164件以上）
- [ ] `npx wxt build` が通る
- [x] e2e（`npm run test:e2e`）が全件通る（利用者のターミナルで実行）

## 結果（実装したAIが書く）
- 変更したファイル：save.ts（http/https/file以外とURL解釈不能は no-url で failed）、save.test.ts（1件追加）、ScrapRow.tsx（空き枠span）、ui.css（.row-tr-slot 2行）、package.json・wxt.config.ts（1.3.8）
- 確認したこと：tsc 通過、vitest 164/164 通過、wxt build 成功
- 未確認：

## 履歴
- e2e Windows対応（2026-10-18 完了）：e2e/*.mjs のパスを fileURLToPath に。利用者の環境で 98/100（失敗2件は本タスクで対応）。
- v1.3.7（2026-10-18 完了）：カード表示の下段はみ出し修正、「Gemini API」に改名。Sonnet実装、Opusが `.meta-flags` の1行を追加して確認。
