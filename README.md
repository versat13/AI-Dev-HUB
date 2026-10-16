# AI-dev-hub
複数のAI（モデル）を切り替えながら開発するための共有ハブ。**Private 必須**（アバターID・PCのパスを含むため）。

## 構成
- `AGENTS.md` 全AI共通ルール（`CLAUDE.md`・`GEMINI.md` はここを読み込むだけ）
- `VRChats/avatar/` アバターギミック：AlyxLiquid / JustShield / QuadViewStudio / Sandevistan
- `VRChats/world/` ワールド：EarWorld / GimmickShowcase
- `Extension/` Chrome拡張機能：ScrapAI（ソース一式あり）
- `_template/` 新規作品用の雛形
- `log/` 作業ログ（`YYYY-MM-DD_<モデル名>.md`）

各作品フォルダの `HANDOFF.md`（60行以内）が入口。詳細は `PROGRESS.md`。種別ごとの共通ルールは各 `RULES.md`。

## AIへの開始指示（コピペ用）
> AGENTS.md と `<作品フォルダ>/HANDOFF.md` を読み、現状を3行で要約して。次にやることの方針案を出して。コードは許可するまで書かないで。

## AIへの終了指示（コピペ用）
> HANDOFF.md を更新し、log/ に短いログを追記して、コミットしてプッシュして。

## 注意
- 同時に作業するAIは1つだけ。並行するときはAIごとにブランチを分ける。
- チャット版のAIはこのリポジトリを読めない。その場合は AGENTS.md と HANDOFF.md を貼り付けて渡す。
