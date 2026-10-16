# Sandevistan 引き継ぎ（2026-10-06 時点、v0.8.5）
種別：avatar　詳細：同じフォルダの `PROGRESS.md`（下の方の「方針」「ファイル」「ビルド時に生成するもの」以降は v0.1 の点群方式の記録で、現在は使っていない）

## 目的と方針
- 走ると本人の姿勢の残像が並び、崩れて消えるアバターギミック。配布前提（プレハブをアバター直下に置くだけで、どの Humanoid でも動く）。
- 内部名は Sandevistan（フォルダ・名前空間・シェーダー・パラメーター `SDV_`）。**販売名には使わない**（商標の懸念、ユーザー認識済み）。メニュー名は仮置き。
- 見えない面を削る最適化は入れない（ユーザーと合意）。

## 環境
- Unity 2022.3.22f1 / VRChat SDK 3.10.5 / MA / NDMF / AAO。プロジェクト GimmickAI_1、シーン `Assets/ギミックテスト1.unity`。
- 検証アバター：ゆめか（Yumeka_v1.0）、Robot_Sandevistan（SDKサンプルのロボット）。テスト用アバター は過去の検証。
- 主なファイル：`Assets/Sandevistan/`（Sandevistan.prefab、Scripts/SandevistanSettings.cs、Scripts/Editor/SandevistanBuild.cs・SandevistanPlugin.cs・SandevistanSettingsEditor.cs、Shaders/、README_Sandevistan.txt）。
- Unity MCP は unityMCP に統一。Unity が2つ開いているときは set_active_instance で GimmickAI_1@… を指定。
- 任意依存：Meshia Mesh Simplification（残像用メッシュだけ間引く。リフレクションで呼ぶ）。

## 現在の状態（できていること）
- 残像＝本体メッシュの複製SMR＋コピーした骨（VRC Constraint、FreezeToWorld で固定）。FXレイヤー SDV_Ghost で記録と崩壊を循環。
- グラデーション色、寿命スライダー、表情の固定（Heavy）、衣装の切り替えへの追従（NDMF Optimizing の FollowToggles）。
- こめかみ＋グーで起動/停止、背中タッチ（他人）で起動、抑制剤、サイコシス、HUD、チリ、効果音。
- v0.8.5：発動時のカクつき対策の「予熱（読み込み後180秒）／常時待機」と、メニュー「負荷」。
- Gesture Manager（Play）で一通り確認済み。

## 次にやること（優先順）
1. VRChat 実機確認：他人の画面での見え方、FreezeToWorld、予熱で発動時のカクつきが減るか、負荷。
2. 他のアバターへの導入テスト、Quest（Light）確認。
3. README と配布パッケージの仕上げ。

## 注意・落とし穴
- パラメータードライバーの Copy は、アニメーションで動かしているパラメーター（AAP）を元にすると0を読む。
- プレハブに保存された設定値は、コードの初期値を変えても更新されない（maxSourceRenderers の件）。
- VRChat は一人称で頭の骨を縮める → 画面系（HUD 等）を Head の子にしない。
- 新規コンストレイントは実行グループ未確定のまま → SandevistanBuild.RefreshConstraintGroups で更新。
- Play 中の `material.GetFloat` は元マテリアルの値。アニメーションの値は `GetPropertyBlock` で読む。
- テスト用の複製は `ZZ_` で始め、削除は完全一致で（前方一致で本体を消した事故あり）。
- 書き込み後は AssetDatabase.Refresh → 約60秒待つ → DLL の更新時刻を確認。

## 未確認
- VRChat 実機での全般（特に予熱の効果、FreezeToWorld、同期）。衣装付きアバターでの汎用化。AAO 併用時のバンドル容量。
