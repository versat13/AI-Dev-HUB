# AI-Dev-HUB
複数のAI（Claude Desktop、Claude Web版、Google AI Studio 等）を交代・連携させながら開発を進めるための私的共有ハブ。

## 参加AI環境
固定の役割分担はせず、実装・テスト・相互コードレビューを交代で行う。
- **Claude Desktop**（Opus 5.5）
- **Claude Web版**（Sonnet 5.5）
- **Google AI Studio**（Gemini 3.8）：ルートの Web 開発サーバー（Vite / ポート3000）で実動作プレビューを提供

## 構成
- `Extension/` Chrome拡張機能（ScrapAI等）
- `VRChats/avatar/` アバターギミック
- `VRChats/world/` ワールド
- `_template/` 新規作品用テンプレート（`HANDOFF.md`, `PROGRESS.md`）
- `log/` 作業ログ（`YYYY-MM-DD_<モデル名>.md`、1エントリ5行以内）
- `package.json` AI Studio 用 Web プレビュー＆テスト実行ハブ

## 運用の要点（トークン節約最優先）
- 各作品の入口は `HANDOFF.md`（**60行以内を厳守**）。作業開始時はここだけを読む。
- 過去の詳細ログや完了履歴は `PROGRESS.md` へ要約退避する。
- 共通ルールは `AGENTS.md`、種別共通ルールは各 `RULES.md` に集約。

## AIへの指示文（コピペ用）
### 開始指示
> AGENTS.md と `<作品フォルダ>/HANDOFF.md` を読み、現状を3行で要約して。次にやることの方針案を出して。コードは許可するまで書かないで。

### 終了指示
> HANDOFF.md を更新（60行以内維持）し、log/ に短いログを追記して、コミットメッセージ案を出して。

## 注意事項
- 同時に作業するAIは1つだけ（交代制）。並行するときはブランチを分ける。
- 他AIの直前コミットや作業中ファイルを不用意に巻き戻し・過剰リファクタリングしない。
- リポジトリはPublicのため、個人情報（個人パス、APIキー、アカウント名等）は書かず抽象化する。
