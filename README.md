# AI-Dev-HUB
複数のAIを交代させながら小規模な作品を作るための私的共有ハブ。作り終えた作品は別リポジトリに分けて公開する。規模の大きい作品は最初から専用リポジトリで作る。

## 参加AIと役割（詳細と権限は `AGENTS.md`）
- **Opus 5.5（Claude）**：設計・作業指示書（`TASK.md`）の作成・レビュー。設計ファイルを変更できるのはOpusだけ。
- **Sonnet 5.5（Claude）**：`TASK.md` に沿った実装。
- **Gemini（Google AI Studio）**：画面のプレビューと見た目の調整（`ai-studio/` ブランチのみ）、別視点のレビュー。

## 構成
- `Extension/` Chrome拡張機能（ScrapAI等）
- `VRChats/avatar/` アバターギミック、`VRChats/world/` ワールド
- `_template/` 新規作品用の雛形（`HANDOFF.md`, `PROGRESS.md`, `TASK.md`）
- `_archive/` 完成・中止した作品の置き場（通常は読まない）
- `log/` 作業ログ（`YYYY-MM-DD_<モデル名>.md`）。前月分は `log/archive/YYYY-MM.md` にまとめる

## AI Studio用のファイル（作品のコードではない）
AI Studio がブラウザ上で ScrapAI の画面をプレビューするためのもの。AI Studio はリポジトリ直下を起点に起動するため、この場所から動かさない。

| ファイル | 役割 |
|---|---|
| `package.json` / `index.html` / `vite.config.ts` / `vitest.config.ts` / `tsconfig.json` / `metadata.json` | プレビューを起動する一式（ポート3000） |
| `src/`（リポジトリ直下） | プレビュー画面の入口と画面切替バー |
| `Extension/ScrapAI/src/lib/browser-shim.ts` | ブラウザ上でChrome拡張のふりをする代役。拡張のビルドには含まれない |
| `GEMINI.md` | Gemini向けの入口（AGENTS.md を読ませるだけ） |

## 運用の要点（トークン節約）
- 作業開始時にAIが読むのは `AGENTS.md` と作品の `HANDOFF.md`（60行以内）、あれば `TASK.md` だけ。
- 詳細や履歴は `PROGRESS.md`。記述は削除せず移動する。

## AIへの指示文（コピペ用）
### 開始指示（Opus）
> AGENTS.md と `<作品フォルダ>/HANDOFF.md` を読み、現状を3行で要約して。次にやることの方針案と、Sonnet向けの TASK.md 案を出して。ファイルは許可するまで変更しないで。

### 開始指示（Sonnet）
> AGENTS.md と `<作品フォルダ>/HANDOFF.md`・`TASK.md` を読み、TASK.md の範囲で進める方針を示して。コードは許可するまで書かないで。

### 開始指示（AI Studio）
> AGENTS.md を読んで。あなたの権限は「ai-studio/ ブランチでのUIファイルの変更」だけ。文書は削除・要約しないこと。`<やりたいこと>`

### 終了指示
> HANDOFF.md を更新（60行以内維持）し、log/ に短いログを追記して、コミットメッセージ案を出して。

## 注意事項
- 同時に作業するAIは1つだけ（交代制）。並行するときはブランチを分ける。
- リポジトリはPublic。個人情報（個人パス、APIキー、アカウント名等）は書かない。
