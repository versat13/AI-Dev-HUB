# Gimmick Showcase（ギミック展示ワールド）引き継ぎ（2026-10-07 時点、v10）
種別：world　詳細：同じフォルダの `PROGRESS.md`

## 目的と方針
- 自作アバターギミック（JustShield、AFTERIMAGE RUN＝Sandevistan、QuadView Studio ほか）を展示・試着できるワールド。
- 暗めのサイバーパンク。Zファイティングを出さない。リアルタイムライトは使わない。展示もハブ設備も左側にまとめる。
- 各ブースに本物のギミックの見た目を使ったサンプルを置く。現金・コインは10秒で復活。

## 環境
- プロジェクト World_Gimmick_AI（Unity 2022.3.22f1 / Worlds SDK 3.10.5）。MCP インスタンス `World_Gimmick_AI@28bd8e6a`。
- シーン `Assets/GimmickShowcase/Scenes/Showcase_Blockout.unity`。
- メニュー Tools/Gimmick Showcase：何かを作り直したら必ず **Rebuild EVERYTHING**。
- アバター用パッケージの Editor フォルダは `Editor~` に改名して無効化している（読み込み直したら同じ対処）。
- フォント：`Fonts/NotoSansJP-Bold_Showcase SDF.asset`（静的。文字追加の手順は PROGRESS.md）。

## 現在の状態（できていること）
- ハブ中央でスポーン → ストリート左側に展示（JustShield / AFTERIMAGE RUN / QUAD VIEW STUDIO / Slot04 閉鎖）。
- v10：札束の山が USE 3回ごとに段階的に崩れ、9回で消えて10秒後に戻る（CashMoundStack.cs）。Play で確認済み。
- Zファイティング0件。**v8〜v10 は未ベイク**。

## 次にやること（優先順）
1. ベイク（手順と時間短縮策は PROGRESS.md）。先に Rebuild EVERYTHING。
2. サンデヴィスタンのサンプル（ホログラム人型の背中に SDV_ImplantSegment 7節を浮かせる。パッケージ読み込み後）。
3. 実機確認：札束の山、YamaPlayer、弾、ホログラム、光芒、LQ の鏡の残像、ジャンプ、的、負荷。
4. 使い勝手（銃が台に戻る、床のゾーン番号）、サウンド、Android版。

## 注意・落とし穴
- ClientSim では Udon の Start がスポーン後に走る（Start 前の USE ではお金が増えない。実機では問題なし）。
- Play で `IsNetworkingSupported cannot be changed…` が1件出る（実機で要確認）。
- 配布パッケージから外すもの・残すものは PROGRESS.md の「配布用パッケージについて」を参照。
- JustShield に asmdef が無く、NDMF が無いプロジェクトでは Editor 全体がエラーになる（改善案あり）。

## 未確認
- 実機での全般。ベイク結果。
