# ギミック展示ワールド（Gimmick Showcase）進捗メモ 2026-10-07（v10）

## 現在の構成
- プロジェクト：`World_Gimmick_AI`（Unity 2022.3.22f1 / Worlds SDK 3.10.5）。MCP のインスタンス名は `World_Gimmick_AI@28bd8e6a`
- シーン：`Assets/GimmickShowcase/Scenes/Showcase_Blockout.unity`
- 流れ：**ハブの中央でスポーン**（Spawn (0, 0.02, 0)、ストリートの方を向く）→ ストリート（x ±3、z 8.75〜57.4）。トンネルは背後に残っている
- 展示は左側に一列（root x=-3、180°回転）
  - JustShield：z 8.9〜21
  - AccelDrive：z 21〜33.1
  - Slot03 = **QUAD VIEW STUDIO（四面図）**：z 33.1〜45.2
  - Slot04：z 45.2〜57.3（閉じたブース）
- Zファイティング 0件。**v8〜v10 はまだベイクしていない**（前回のベイクは1時間以上終わらなかった）
- **メニュー（Tools/Gimmick Showcase）**
  - **Rebuild EVERYTHING**：全ブース → AFTERIMAGE RUN → QuadView ブース → JS Demo → QuadView Sample → Hub Layout → Lighting Pass の順に実行。何かを作り直したら必ずこれを使う
  - 個別のメニュー：Rebuild All Booths / AFTERIMAGE RUN / TRI VIEW STUDIO（中身は QuadView ブース）/ JS Demo Stage / Rebuild QuadView Sample / Render QuadView Sample Sheet / Apply Hub Layout / Apply Lighting Pass / Check Z-Fighting

## v10 の変更（2026-10-07）：札束の山が段階的に崩れる
- **CashMoundStack.cs**（新規 U#、同期なし、`Udon/CashMoundStack.asset`）
  - USE するたびに UdonChips が +200
  - 3回ごとに、上段 → 中段 → 下段の順に崩れる
    - 崩れた段のメッシュを隠し、散らばった札束のメッシュを出す
    - 札束が飛び散るパーティクル（札束のメッシュ、18個、World コリジョン）を出す
    - 崩れる音を鳴らす（札束の dropSound）
  - 9回で全部消えて当たり判定が切れる。10秒後に満杯に戻る
  - 当たり判定の高さは段に合わせて低くなる：0.53 / 0.36 / 0.20
  - interactText は「札束を取る」、proximity は 2.5
- AfterimageRunBuilder.CashMound が作るもの
  - CashMound/Stage_Top・Stage_Mid・Stage_Bottom：各2層で、それぞれ1つのメッシュに結合。中は詰め物の箱。各段の上の層は全面に並べ、崩れたときの切り口になる
  - Debris_AfterTop（中段の上に16個）
  - Debris_AfterMid（下段の上に18個と、机の上に10個）
  - CrumbleFX_*×3、AudioSource、BoxCollider
  - メッシュは `Models/Generated/CashMound_02_CashTable_<部位>.asset`
- 山の頂上に置いていた拾える現金8個は削除した（崩れると宙に浮くため）。ふもとの一周26個は残した
- Play で確認した結果
  - 3回・6回・9回で段が消える。散らばった札束も切り替わる
  - 10秒後に満杯に戻る
  - 1回の USE で money が +200 になる
- 注意：ClientSim では、Udon の Start がスポーン後に実行される。Start より前に USE すると、udonChips が null でお金が増えない（実機では問題ない）

## 配布用パッケージについて（ユーザーに説明済み、ユーザーが自分で行う）
- 配布物から外すもの（開発用のメニュー）
  - `JustShield/Scripts/Editor/JustShieldSetup.cs`
  - `QuadViewStudio/Editor/QuadViewStudioBuilder.cs`
  - `QuadViewStudio/Editor/QuadViewStudio.Editor.asmdef`
- **JustShieldBuild.cs（NDMF プラグイン）・TagAtlas・TagSettingsEditor は必要**なので残す
- JustShield には asmdef が無い。そのため、NDMF が無いプロジェクトでは Assembly-CSharp-Editor 全体がエラーになる（今後の改善案：asmdef を作り、versionDefines と defineConstraints で NDMF があるときだけコンパイルする）

## v9 の変更（2026-10-07）
1. 読み込んだパッケージ：QuadViewStudio、JustShield（アバター用）、YamaPlayer（net.kwxxw.yama-stream 1.5.18）
   - アバター用のエディタスクリプトは、ワールドのプロジェクトではコンパイルできない。`JustShield/Scripts/Editor` と `QuadViewStudio/Editor` を `Editor~` に名前を変えた（.meta は `Editor~/_Editor_folder.meta.bak` に移した）
   - パッケージを読み込み直したら、同じ手順で対処する
   - アバター用の Prefab はシーンに置かない。メッシュ・マテリアル・シェーダーだけを使う
2. ハブは全部左側（-x）：WORLD GUIDE (-6.4, -3.8)、YamaPlayer は左の壁 (-8.7, 2.45, 0)・1.2倍（Hub/ScreenFrame 付き）、ALL-IN ペデスタル (-6.0, 4.2)、ペンの台と QvPen (-5.2, -5.8)
3. JS のデモ：本物の JS_HexSphere と JustShield/Barrier（`Materials/FX/M_JS_Barrier_Demo`、_Hemi=0、1.9倍）
4. QuadView のサンプル（Booth_Slot03/Content/QVSample）
   - 置いたもの：QVS_FloorGuide、アンバーの人型、パネル（1.6×0.9m、1.6m 先、高さ 1.23m）
   - パネルの絵 `Textures/QVS_SampleSheet.png`（並びは 正面 | 右 / 背面 | 左）。奥の壁にも同じ画像を貼った
5. Play では、`IsNetworkingSupported cannot be changed…`（UdonManager.OnSceneLoaded）が1件出る。実機で確認する
6. 教訓：C# の行を文字列置換で直すとき、行末にコメントを付けると、その後ろの文がコメントに入ってしまう

## v8（クオリティアップ）の要点
- HoloFX シェーダー、空中投影ディスプレイ、JS のデモ展示（Animator で回す）、JS の弾は見た目 60%（baseScale のバグを修正）
- Lighting Pass
  - _Soft 化
  - ライトの色を役割で統一する
  - 光芒15灯、Bloom 1.2 / 1.8、フォグ 0.018
  - padding 4・解像度 8、LP_Detail、RP_AD_Catwalk
- リアルタイムライトは使わない

## ペデスタル（設定データで管理）
| ブース | 位置 | アバターID |
|---|---|---|
| JS | (2.4, 5.4) | avtr_90aebd5e-43d3-4c74-9347-d3f2de401680 |
| AD A | (2.4, 8.9) | avtr_cc5f3e43-da3d-490f-bd97-faf439eaaeea |
| AD B | (2.4, 10.4) | avtr_9cd8140d-8616-4480-9668-a13b9eb54f1b |
| 四面図 | (2.4, 4.4) | avtr_6c91d1c0-f74f-4701-b6d4-20d881f71cc7 |
| ハブ ALL-IN | (-6.0, 4.2) | avtr_72e7c337-… |

## AD（AFTERIMAGE RUN）のレイアウト（v7）
- スタート：札束の山（v10 で崩れるようにした）、銃の台、両面が鏡の壁
- S字：柱3本と、床の現金の山
- ジャンプ：奥の壁沿いに、まっすぐジャンプ → 左に90°曲がってジャンプ → 下り階段
- 的は3か所（TargetAnchor.cs）

## ベイクの手順（ユーザーに案内済み）
- Window > Rendering > Lighting → Scene タブ → Progressive CPU を確認 → Generate Lighting → 終わったら保存する
- 時間がかかりすぎる場合は、Lightmap Resolution を 8 → 6 にするか、Max Lightmap Size を 1024 にする
- 作り直したら、先に Rebuild EVERYTHING を実行してからベイクする

## フォント
- `Fonts/NotoSansJP-Bold_Showcase SDF.asset`（静的・マルチアトラス）
- 新しい文字が必要になったら：sourceFontFile に ttf を設定 → Dynamic → TryAddCharacters → Static

## 方針（ユーザー決定）
- 暗めのサイバーパンク。Zファイティングを出さない。リアルタイムライトは使わない
- 鏡は近づくまで点かない。スイッチは最初から ON。LuraSwitch2 を使う
- 展示もハブの設備も左側にまとめる
- 各ブースに、本物のギミックの見た目を使ったサンプルを置く
- サンデヴィスタンのサンプル（後日）：ホログラムの人型の背中に、SDV_ImplantSegment の7節をふわふわ浮かせる
- 現金・コインは10秒で復活。札束の山は3回ごとに崩れ、9回で消えて10秒後に戻る

## 次の候補
- ベイク
- サンデヴィスタンのサンプル（パッケージを読み込んでから）
- 実機での確認：札束の山（USE の判定・音・パーティクル）、YamaPlayer、弾、ホログラム、光芒、LQ の鏡の残像、ジャンプ2、的②、負荷
- 使い勝手：銃が台に自動で戻る、床のゾーン番号。サウンド。Android版
