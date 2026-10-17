# Sandevistan（旧称 AccelDrive）進捗メモ 2026-10-06（v0.8.5）

現状：v0.1 試作が完成。NDMFビルドは通り、アニメーションのバインド欠落は0件。エディタ上でシミュレーションして見た目を確認済み。**VRChat実機は未確認**。

## v0.3：姿勢を固定したコピー（PC版の標準）※v0.2のカメラ方式は廃止
- v0.2（カメラで記録する方式）は実機でデータが壊れた。
  - 原因はエディタで確認済み：ScreenTint（全画面に描く）が記録カメラにも描画され、記録テクスチャを全部上書きしていた。
  - さらにユーザーの指摘：アバターのカメラは見る側の設定次第で動かない（三面図のパネルと同じ理由）。→ カメラ方式は不採用とし、関連するシェーダーは削除した。
- **方式**：`Ghosts/Copy_i`（標準5体）。本体と同じメッシュとテクスチャを使う複製SMRに、骨の階層をコピーして割り当てる。
  - 骨：VRCRotationConstraint（Hipsのみ VRCParentConstraint）、ローカル空間、Locked。対象は人型の骨と、揺れ物の付け根の骨（`ghostAllBones` をONにすると全部の骨）。
  - 根元（Copy_i）：VRCParentConstraint で本体の根元に追従し、**FreezeToWorld** でその場に残す。
  - 再生モードで確認した挙動：FreezeToWorld=1 でワールドに固定、骨の IsActive=0 で姿勢がそのまま止まる、解除すると本体に戻る。
- **FXレイヤー SDV_Ghost**：Idle → F0..F4（1周目は未記録のコピーを非表示）→ C0..C4 を循環。SDV_Active が偽になったら Fade → Idle。
  - 状態kではコピーkを記録中（FreezeToWorld=0、骨の IsActive=1、_Age=1で非表示）にする。他のコピーは止めて、`_Age` を経過時間に合わせて進める。
  - アニメーションのプロパティ名：`VRCParentConstraint.FreezeToWorld`、`VRCRotationConstraint.IsActive`（GetAnimatableBindings で確認）。
- シェーダー `Sandevistan/Ghost`：本人のテクスチャ、色相、縁の発光、_Age に応じた崩れと上昇、_Corrupt。深度だけ書くパスと色のパスの2パス。
- **v0.3.1（ユーザーの要望：崩れるのが早すぎる → 約5秒保持）**：Standard 10体×0.5秒、Full 14体×0.36秒、Light 6体×0.8秒（どれも寿命は約5秒）。崩れ・上昇・フェードは寿命の最後の2〜3割だけ（シェーダーで _Age が0.75〜0.8を超えてから）。終了時の Fade は1.2秒。テスト用アバター(旧)の場合、Constraint 215個（ランクはGood）、ポリゴン合計75k。Quest は粒子の残像。
- 再生モードでの確認方法の追記：Gesture Manager の Module が null のときは `new ModuleVrc3(desc, null)` を `SetModule` で設定する。ツール呼び出しの遅延が大きいので `Time.timeScale = 0.25` にしてから撮影する。
- **テスト用アバター(旧)での負荷**：（v0.3：5体の時点）Constraint 105個、複製SMR 10個、ポリゴン約3.2万。
- **再生モード（Gesture Manager）で動作確認済み**：VelocityZ=4 で走らせ、Rigidbody で秒速4m移動すると、0.48m間隔で本人の走る姿勢が残り、崩れて消える。
- Gesture Manager でのパラメータ操作：`GestureManager.Module.GetParam(name).Set(module, value, null)`。
- ALYX（AlyxLiquidTests）はシーンのテスト用アバター(旧)から削除済み（素材のファイルは残してある）。
- 制限：表情などアニメーションするシェイプキーは残像に反映されない（ビルド時の値で固定）。

## 名称変更（2026-10-04）
- ユーザーの指示でギミック名を **Sandevistan** に変更：メニュー名、シーンのオブジェクト名、プレハブ `Assets/Sandevistan/Sandevistan.prefab`、NDMFの DisplayName。内部名（フォルダ・名前空間・スクリプト・シェーダー名・パラメータ SDV_）は Sandevistan のまま。
- 作品名の商標上の注意（有料配布時）はユーザーに伝え済み。

## v0.4（コンパイル済み・**再生モードで確認済み**）
- 「ポリゴンを使わないコピー」はできない。固定した姿勢を保持するには別の骨（VRC Constraint）か記録テクスチャ（カメラ＝他人の画面で動かない）が必要で、描画するならポリゴンは必ずかかる。
- **グラデーション**：設定項目 `ghostGradient`（初期値 緑→シアン→青紫→マゼンタ）。SDV_Ghost を S0..S(M+N-1)（m番目の記録＝コピー m%N、色は m/(M-1)）→ C0..C(N-1)（終わりの色で循環）に展開。各状態に専用の _Fade 状態があり、色を保ったまま崩れる。シェーダーは `_GradTex`（256×1、ビルド時に生成）＋`_HueT`。M＝ceil(最長発動時間×N/寿命)、最大64。
- **寿命スライダー**：`SDV_LifeSpeed`（＝1/秒）を各状態の速度パラメータに使う。基本の間隔は1/N秒（速度1で寿命1秒）。メニューに Radial（同期Float、8bit）をビルド時に追加。左ほど長く（0.01で100秒）、右端で1秒。設定項目 `ghostCount`（10）、`ghostLifetime`（5秒）、`lifetimeSlider`。
- **表情**：`ghostExpressions`。元のFX（記述子のFXのみ。MAで合成されるFXは対象外）から、元メッシュのシェイプキーを動かすレイヤーを抽出し、コピーごとに複製する。
  - クリップはシェイプキーの曲線だけ残し、パスをコピーへ付け替える。使うパラメータは `SDV_E{k}_元の名前` に置き換える。
  - 記録状態でパラメータドライバーの Copy（localOnly=false）を実行し、そのときの値を写す → 表情が固まる。負荷はレイヤー数×コピー数。
- **汎用化**：`maxSourceRenderers`（8）。MA Merge Armature の統合を予測（prefix/suffix を除いた同名の骨を統合先とみなす）。コピーの骨はビルド時のワールド姿勢から作る。**衣装付きアバターでは未検証**。
- 確認結果：
  - NDMFでのビルドは約15秒（Sandevistanの処理は約11秒）。アニメーションの参照は約2万件で、欠落は0。
  - SDV_Expr レイヤーは 元の4レイヤー×10体＝40個。表情パラメータのCopyは5個。
  - 再生モード：GestureLeft を3から6に切り替えると、古い残像は bikkuri2、新しい残像は tere の表情で残った。_HueT は 0→0.07→…→0.40 と順に上がった。
  - 同期bitはアバター全体で123。
- 注意：AAO がメッシュを最適化すると、元のメッシュと最適化後のメッシュが両方バンドルに入り、容量が増える可能性がある（未検証）。

## v0.5（2026-10-06、テスト用アバターで再生モード確認済み）
- 共通：メニューは Sandevistan ＞ 発動／抑制剤／**設定**。設定はすべて保存される。
  - 設定の中身：発動の持続時間 SDV_Dur、残像の持続時間 SDV_LifeSpeed、残像数 SDV_GCount（3/5/7/10）、不透明 SDV_Opaque（初期値ON）、色：速さで明るさ SDV_SpdMode、効果音 SDV_Sound、チリの範囲 SDV_DustR（ローカル）、More＞他人のタッチ SDV_OtherTouch／サイコシス有効。
- 残像：本体の3cm後ろに固定。速度が `ghostMinSpeed` 0.3m/s 未満なら非表示（シェーダーで _Spd を見る）。影なし、ライトなし。
  - 間隔の初期値は0.3秒（GhostBase 0.1 / SDV_LifeSpeed）。
  - アップロード時の上限は `ghostCount`（最大10）。
  - 不透明（GhostOpaque：ディザでフェード）と半透明（Ghost）は、マテリアルの差し替えで切り替える。
- **重要な修正**：パラメータドライバーの Copy は、**アニメーションで動かしているパラメータ（AAP）を元にすると0を読む**（GMの実装も同じ扱い。VRChatの仕様に合わせている）。
  - SDV_Elapsed は AAP をやめ、`SDV_TimeStep` レイヤーで20段階の Set ドライバー（localOnly=false）に変更した。これでグラデーションが動作する。
- アニメーター：`animatorProfile` Light（初期値、表情レイヤーなし）と Heavy（表情を固定）。
- チリ：装着者のみ（レイヤー SDV_Dust で半径と量をBlendTreeで制御）。
- HUD：画面上部の細いバーが両側から減る（ローカルのみ。クールダウン中は灰色）。インプラントは上のセグメントから消えていく。
- 音：SE_Start／SE_Loop（loopDelay 0.6秒）／SE_End／SE_Touch。仮の音は `Audio/SDV_SE_*.wav`。VRCSpatialAudioSource 付き。
- 抑制剤：右手に注射器（ビルド時に生成）。SDV_Pill で注入演出。
- トリガー：こめかみの左右に Contact を置き、同じ側の手でグー（Gesture==1）をすると発動。他人が触れても発動する（SDV_OtherTouch）。振動はアバターのAPIでは不可能なので、代わりにローカルでクリック音を鳴らす。
- サイコシスの残像：四角の崩壊から、ノイズ由来の有機的な崩壊、裂け目、帯状のスライスに変更。本体は変更していない。
- **テスト用アバターでの結果**：
  - NDMFビルドは約58秒（AAO込み）。
  - 同期bitは61（アバター全体）。
  - FXに AD 系の16レイヤーを追加。
  - SMR 91、Constraint 710、Contact 4、PS 6、Audio 4。
- テスト用アバターのスカートの修正（シーン上で変更。Undo可能）：Skirt*の PhysBone を変更した。

  | 項目 | 変更前 | 変更後 |
  |---|---|---|
  | pull | 0.2 | 0.35 |
  | spring | 0.2 | 0.3 |
  | stiffness | 0.2 | 0.3 |
  | gravity | 0 | 0.15 |
  | gravityFalloff | 0 | 0.7 |
  | 角度制限（Polar） | 30° | 22° |
  | コライダー | 片脚のみ | 左右の脚両方 |
  | Grab／Pose | ON | OFF |
  | 他人との衝突 | ON | OFF（自分との衝突のみ） |
- テスト用アバターの注意点：
  - 1体あたり約71kポリゴン。10体だと非常に重いので、5体前後を推奨。
  - SMRが10個あるので、描画の呼び出しが多い。
  - 揺れ物（髪・スカート・リボン）は残像では静止姿勢になる。
  - expressionParameters がない。

## v0.5.1（2026-10-06）：残像の簡略化（Meshia を使用。A1 方式）
- 方針：Meshia Mesh Simplification（com.ramtype0.meshia.mesh-simplification 3.2.0、MIT）が入っていれば、**残像用メッシュだけ**をビルド時に間引く。入っていなければ元のメッシュを使う。本体は変更しない。
- 実装：
  - Meshia のアセンブリが無くてもコンパイルできるよう、**リフレクション**で呼ぶ。
  - 呼び出しは `MeshSimplifier.Simplify(Mesh, MeshSimplificationTarget{Kind=RelativeTriangleCount, Value}, MeshSimplifierOptions.Default(+PreserveBorderEdges=true), Mesh dst)`。
  - submesh 数か bindposes 数が元と違う場合、または例外が出た場合は、元のメッシュに戻す。
  - BlendShape は保持される（テスト用アバター の Body 45→45）。残像の BlendShape の重みは名前で対応させる。
- 設定：`ghostSimplify`（true）、`ghostPolygonRatio`（0.5）。
- Meshia 側の NDMF プラグインは Resolving と Optimizing のフェーズで動く（AAO より前）。Cascading（自動間引き）を併用した場合の残像の扱いは未確認。
- テスト用アバター での結果：
  - 1体あたり 70.3k → 34.4k ポリゴン。
  - ビルドは約49秒。Sandevistan の処理が約42秒で、うち大半が簡略化。
  - 50% では見た目はほぼ同じ。25% ではスカートの裾と顔がやや崩れる。
- 配布テキスト：`Assets/Sandevistan/README_Sandevistan.txt`（ドラフト、BOM付き、CRLF）。冒頭で Meshia の導入を強く推奨すると明記した。
- MCP：今後は Unity MCP（unityMCP）に統一する。
  - execute_code は Roslyn で動き、クラスで包む必要がない。`Object` は曖昧になるので `UnityEngine.Object` と書く。
  - Directory.Delete などを使うには safety_checks=false が必要。
  - refresh_unity で compile=request と wait_for_ready を使う。
  - read_console は filter_text と include_stacktrace=false を使う。
- 2026-10-06 追記：
  - マスクが残像に出なかった原因：プレハブに保存された `maxSourceRenderers` が古い値の 8 のまま残っていた（コードの初期値の変更はプレハブに反映されない）。面積の小さい Mask と Under が上位8から外れていた。
  - 対応：上限を16にし、間引き率の初期値を0.25にした（プレハブ、コード、READMEの3か所）。
  - テスト用アバター の結果：1体あたり 22.7k ポリゴン、10メッシュすべてを含む。
- 配布上の懸念（衣装の切り替え）の検討：
  - 現状は、ビルド時に有効だったレンダラーの状態を固定してしまう。
  - 対策案：MA の後（AAO より前）に「追従パス」を置く。最終的なFXの中で、元のレンダラーの m_IsActive／m_Enabled／blendShape を動かしているカーブを、全コピーにも複製する。
  - あわせて、初期状態で非表示のレンダラーも残像に含め、MeshRenderer も対象にする。

## v0.6（2026-10-06）：残像を衣装の切り替えに追従させる
- 残像の対象：`ListGhostCandidates` で選ぶ（インスペクターの確認表示と共通）。
  - 対象は SMR と、骨に付いた MeshRenderer（親の骨1本にウェイト1で結び付けた SkinnedMesh に変換する）。
  - 非表示の衣装も含める。並び順は「表示中が先」→「ポリゴン数が多い順」で、上限は maxSourceRenderers（24、最大32）。
  - 除外するもの：EditorOnly、コンストレイントの下にある物（ワールド固定など）、MA Bone Proxy の小物、骨のない物、マテリアルのない物、excludeRenderers に指定した物。
- 残像の階層：元のパスをなぞる入れ物 `Copy_i/_R/<元のパス>` を作り、残像のレンダラーはその末端に置く。各入れ物の activeSelf は元と同じにする。
- 追従パス：NDMF の Optimizing フェーズで、MA より後・AAO より前に `FollowToggles` を実行する。
  - 最終的な FX のクリップから次のカーブを探し、全コピーの対応先にも複製する。複製したクリップやブレンドツリーは Instantiate したものを保存する（元のアセットは変更しない）。
    - 元のオブジェクトの m_IsActive → 対応する入れ物
    - レンダラーの m_Enabled → 残像の SMR
    - blendShape.* → 残像の SMR（顔メッシュは除く。VisemeSkinnedMesh と eyelidsSkinnedMesh で判定）
  - 初期状態も追従パスで再同期する。
- 設定項目：ghostFollowToggles、ghostIncludeHidden、ghostIncludeMeshRenderers。sourceRenderers／excludeRenderers の型は Renderer[] に変更した。
- インスペクター（SandevistanSettingsEditor）：
  - Meshia が未導入なら警告を出す。
  - 重さの目安（表示中の衣装の残像1体あたりのポリゴン数 × 体数）を表示する。
  - 「残像に含まれるメッシュを確認」の一覧で、○／× と理由を表示する。
- 確認結果：テスト用アバター の複製に MA Object Toggle（Mask を OFF、TestHat を ON）を足してビルドした。
  - MA の Reactive クリップに Copy_*/_R/Mask と TestHat のカーブが追加された。
  - 非表示の TestHat も残像に入り、頭の位置に正しく描画された。
- README：「5. 衣装・小物について」を追加した。
- 見えない面を削る最適化は入れない（ユーザーと合意。改変時に各自でやるもので、壊れるおそれがあるため）。
- 注意：テスト用の複製がシーンに9個残っていたので削除した（ツールの切断や再接続のときに残るらしい）。

## v0.7（2026-10-06）：テスト用アバター での実機フィードバック対応
- 自分の残像が視界をふさぐ問題：シェーダーの NearKeep で、目から 0.3〜0.6m の残像を透明にする（不透明版はディザで抜く、半透明版はアルファで薄める。深度パスも消す）。鏡・撮影カメラ（_VRChatMirrorMode／_VRChatCameraMode）では消さない。全員の画面で同じ処理。
- HUD：_Y を 0.65（NDC で y=-0.3、視界の中央より下）、_W を 0.3（画面幅の3割）に変更。
- インプラント：背中の表面を推定する頂点を、胴体の骨（Hips〜Neck、衣装は同名の骨も含む）に一番強く付いた頂点だけに限定した（以前は髪の外側に置かれ、約12cm浮いていた）。髪が長いと隠れる → README で implantOffset を案内。
- こめかみで停止：レイヤー SDV_TouchStop（ローカル）。Off→Hold（Active）→Armed（TL と TR が両方離れた）→ 触れてグーで Stop（Req=0 を Set）。
- 他人のタッチ：TO＋OtherTouch に加えて、自分のどちらかの手が Gesture==1 かつ Weight>0.5 のときだけ発動。
- メニュー：「発動の持続時間（大きいほど長い）」「残像の持続時間（大きいほど長い）」。
  - SDV_Dur と SDV_LifeSpeed はスライダーの値 r（0〜1）とした。
  - 秒数は指数で割り当て：発動 2〜40秒、残像の間隔 0.05〜2秒。
  - 別コントローラー SDV_FX_Remap（Direct BlendTree、WD ON、17点）で、SDV_DurSpd＝2/秒数、SDV_LifeSpd＝0.1/間隔 を AAP として計算し、各ステートの speed パラメーターに使う。全員の端末で計算する。
  - 初期値：r＝0.463（8秒）、0.486（0.3秒）。
- チリ（v0.7.1 で修正）：半球にする案は誤解だった（ユーザーの意図は「周囲の範囲を前に偏らせる」）。全方向の球に戻し、入れ物も Sandevistan（アバターの向き）の下に戻した。球の中心を前方へ半径×0.75（DustFwd）ずらすので、前 1.75R・後ろ 0.25R になる。SDV_Dust の Min／Max クリップで ShapeModule.m_Position.z も半径に合わせて動かす。試験（R=2）：前後方向 -0.3〜3.27m。
- HUD（v0.7.1）：_Y を 0.75 に変更（中央から下へ50%）。
- 間引き率：25% のまま。説明文と README に「体が透けるときは 50% に」を追記。
- 音声の Load In Background をオン（VRChat の検証エラー対策）。テスト用アバター の初回アップロードで「Name cannot be empty」が出たのは、SDK の名前欄が空だったため。

## v0.8（2026-10-06）：名前の統一、ゆめかへの適用、動作の整理
- **名前の統一**：AccelDrive をやめ、すべて Sandevistan にした。
  - フォルダ：`Assets/Sandevistan/`（AssetDatabase で移動したので GUID は維持）
  - スクリプト：`SandevistanSettings`／`SandevistanBuild`／`SandevistanPlugin`／`SandevistanSettingsEditor`（名前空間 Sandevistan）
  - NDMF の QualifiedName：net.sandevistan.build
  - シェーダー名：`Sandevistan/*`
  - アセットとパラメーターの頭文字：`SDV_`（パラメーター名が変わるので、ゲーム内に保存された設定は初期化される）
  - このメモも Sandevistan_進捗メモ.md に改名した（旧 AccelDrive_進捗メモ.md は削除）。
  - 販売名に Sandevistan を使うのは問題がありそう（ユーザーも認識済み）。内部名としてだけ使う。
- 速さによる残像の非表示（ghostMinSpeed／_MinSpd）を廃止し、常に一定の間隔で残像を出す。
- サイコシスで勝手に発動する仕組み（PsychoRandom レイヤー）を削除した。
- 他人による起動：こめかみの他人用レシーバーを廃止した。代わりに、胸の骨の背中側に Capsule 型のレシーバー SDV_BackOthers（半径 0.07k・高さ 0.32k、他人のみ、Hand／Finger）を置く。
  - SDV_Control に BackHold ステート（2秒）を追加：SDV_BackTouch かつ OtherTouch で入り、離れたら Idle に戻る。2秒経つと Trigger。自分の同意は不要。
- こめかみでの起動と停止は SDV_TempleOn（ローカル・保存・初期値 ON）でオン／オフできる。
- メニュー構成：
  - 発動、抑制剤、設定
  - 設定の中：起動方法（こめかみで起動／背中タッチで起動（他人））、長さ（発動の持続時間／残像の持続時間）、見た目（残像数／不透明／色：速さで明るさ／チリの範囲）、効果音、サイコシス
- プレハブのメニューの子要素と MA Parameters の旧 AD_ 項目は削除した（ビルド時に作り直される）。
- プレハブの ghostPolygonRatio を 0.5 にした（コードの初期値は 0.25 のまま）。
- 背中のパーツを Blender で作り直した：
  - 元データ：`Models/Source~/SDV_ImplantSegment.blend` と同名の .json。Unity 用のメッシュは `Models/SDV_ImplantSegment.asset`（492 ポリゴン、932 頂点、頂点カラー R＝発光）。
  - 形：曲面の装甲板、中央の隆起と発光の溝、左右のフィン（発光スリット付き）、左右のポート（発光）、上下の接続部。
  - 座標は x＝幅、y＝背骨方向、z＝外向き。板の半幅＝1、板の半高＝0.86。
  - SandevistanBuild.AddSegment が7節を並べる（幅 hw×0.9、高さ hh/0.86×1.15）。Quest 版は従来の箱。7節で 3,444 ポリゴン。
  - SDV_Implant シェーダーに金属の縁の照り返し（フレネル）を追加した。
- **ゆめか（Yumeka_v1.0、シーン Assets/ギミックテスト1.unity）**：今後はこのアバターで検証する（無料・改変ペデスタル公開可）。
  - Sandevistan を追加し、NDMF ビルドが通った（約71秒、同期 73bit）。
  - 残像の対象は SMR 20個。Jacket と Bra は非表示だが、切り替えで出る。
  - 50% に間引くと、残像1体 42.6k ポリゴン、SMR 20個。
  - 衣装追従：クリップ16個、カーブ350本を追加した。
  - 注意：顔メッシュ Body のシェイプキーが446個あり、残像メッシュにもすべて残る（メモリが増える）。残像1体あたり SMR が20個で描画回数が多いので、残像数は少なめを推奨。
- Unity MCP：Unity が2つ開いている場合（World_Gimmick_AI と GimmickAI_1）は、set_active_instance で GimmickAI_1@… を指定する。

## v0.8.1（2026-10-06）
- 発動前の姿勢が残る不具合を修正した：
  - 原因：ghostMinSpeed を廃止したため、以前の「Idle で SDV_V=0 → 速度で非表示」という仕組みが効かなくなっていた。
  - 対策：コピーごとに「記録済み」フラグ SDV_R{k} を持たせる。Idle のドライバーで 0 にし、記録ステートのドライバーで 1 にする。値は GhostData の BlendTree で material._Rec に流し、_Rec<0.5 なら非表示にする。
  - Gesture Manager で確認：記録前のコピー（6〜9）は rec=0 で非表示。
- コンストレイントの深さ 711 は、SDK 側の計算の見かけ上の値だった：新しく作ったコンストレイントは実行グループが -1（未確定）のままで、SDK の性能表示が1個ずつ別の深さとして数えていた。
  - VRCConstraintManager.Sdk_ManuallyRefreshGroups をリフレクションで呼ぶ（SandevistanBuild.RefreshConstraintGroups）。Optimizing パスの追従処理の後に実行し、深さは 11 になった（各コピー内の入れ子の深さ）。
- Bounds：HudBar と ScreenTint を Head の子にし、メッシュの Bounds を 0.6m にした（目＝カメラは常にこの範囲内にあるので、画面から消えない）。ゆめかの Extents は 5000 → 約1.5m。
- **作業上の注意**：テスト用の複製を名前の前方一致で消したとき、「Yumeka_」で本体 Yumeka_v1.0 まで消してしまった。保存済みのシーンを開き直して復旧した（blueprintId も残っていた）。今後、テスト用の複製は「ZZ_」で始まる名前にし、名前は完全一致で消す。

## v0.8.2（2026-10-06）
- v0.8.1 で HudBar と ScreenTint を Head の子にしたら、VRChat の実機で見えなくなった（VRChat は一人称のとき自分の頭の骨を縮めるので、子も小さくなって画面から外れる）。
  - 修正：アバターの根元（Sandevistan）の下に戻し、メッシュの Bounds を目の高さを中心にした箱にした（EyeBounds：幅2m、高さは目の高さ×1.6、中心は目の高さ×0.6）。目は常にこの箱の中にある。ゆめかの Bounds の Extents は約1.5m のまま。
- スライダー50%を初期値にした：
  - 発動 2〜32秒（指数で割り当て、50%＝8秒）。残像の間隔 0.05〜1.8秒（50%＝0.3秒）。チリの範囲も初期値 0.5。
  - 設定の Range も 2〜32秒、0.05〜1.8秒に変更した。
- サイコシスの火花（SDV_Glitch）：Head から外し、Chest の子にして背中の後ろ 0.12k の位置へ移した。シミュレーションをローカル空間にしたので、後ろ向きに走っても顔の中を火花が通らない。

## v0.8.3（2026-10-06）
- 背中のパーツを体にぴったり付けるようにした：
  - 節ごとに、背骨の真後ろの細い帯（±1.8cm×k）で一番外側の体表を探す。見つからなければ帯を広げる。
  - 節の上下2点の体表から傾きを出して、板を体の曲面に沿わせる。
  - 2mm×k だけ体に沈めて、隙間を作らない。
- 抑制剤を逆手持ちにした：
  - 人差し指の付け根→小指の付け根を針の向きにし、手のひらの向き（基本姿勢では下向き）へ 2.2cm×k ずらして、握った拳の中に置く。
  - ゆめかは袖が長く手が隠れるので、見た目は確認しにくい。
- VRChat のロボットアバター：SDK に同梱されているサンプル「Robot Avatar」（Avatar Dynamics のデモ）を `Assets/Samples/VRChat SDK - Avatars/3.10.5/Robot Avatar` に取り込んだ。
  - ライセンスは VRChat Distro License（無料・非営利なら改変して配布可）。
  - PC 用と Android 用のシーンが付いている。

## v0.8.4（2026-10-06）
- 効果音：起動音を `Audio/SDV_SE_Start.mp3`（2.4秒）、終了音を `Audio/SDV_SE_End.mp3`（2.14秒）に差し替えた（loadInBackground と forceToMono を設定）。プレハブの seStart／seEnd に割り当て済み。
  - SDV_Sound レイヤーの End クリップは、終了音の長さ＋0.1秒にした（今回は 2.24秒）。最後まで鳴る。
  - 旧 wav のうち Loop と Touch は今も使っている。Start と End の wav は未使用だが、ファイルは残してある。
- 背中のパーツ：体表の細かい凹凸に合わせるのをやめ、なめらかな曲線に沿って並べる。
  - 背骨に沿って15点で体表の z を測り、z = a + b·t + c·t² を最小二乗で当てはめる。
  - 体にめり込む点があれば、曲線全体を外へずらす（4mm×k まではめり込みを許す）。
  - 各節の傾きは曲線の微分から求める。
- ロボット：PC 用サンプルシーンからアバター（記述子付き）を `Assets/ギミックテスト1.unity` へ移し、`Robot_Sandevistan`（x=0.58）として Sandevistan を追加した。
  - 以前から置いてあった記述子なしの FBX（Tutorial_Robot_Avatar_Dynamics_Demo_v1、原点）は非表示にした。
  - NDMF ビルドは約44秒で、FX は22レイヤー。
  - 背中のパーツはほぼまっすぐな曲線で背中に乗った。抑制剤は拳を握ると逆手で握り、小指側から下に出ることを確認した。
  - ロボットの Body には後ろへ垂れる飾りがあり、背中のパーツの一部はその陰になる。

## v0.8.5（2026-10-06）：負荷の前倒し（予熱／常時待機）とメニュー「負荷」
- 目的：発動した瞬間に、周りの人の画面がカクッと止まるのを減らす。主な原因は、初めて描くときのシェーダーの準備と、残像の骨・スキニングが一斉に動き出すこと（推定）。
- 仕組み（SDV_Ghost レイヤー）：残像数 c ごとに `G{c}_Preheat`（クリップ長＝preheatSeconds）と `G{c}_Standby` を追加。
  - どちらも、コピー c 体を「表示・骨の追従 ON・FreezeToWorld=0・_Age=1」にする。シェーダーは _Age≥0.999 で頂点を画面外へ出すので見えないが、スキニングと描画の準備は走る。SDV_R も Idle で 0。
  - Idle →（Standby）→ G{c}_Standby、Idle →（Preheat かつ Standby でない かつ SDV_PreheatDone<0.5）→ G{c}_Preheat。どちらも Active で `G{c}_0` へ進む。
  - 設定や残像数が変わったら Idle に戻って選び直す（予熱のタイマーは最初から）。
  - 予熱が終わると PreheatDone ステートで SDV_PreheatDone=1（同期しない内部パラメーター）。予熱を OFF にすると PreheatReset で 0 に戻り、次に ON にしたらまた予熱する。
  - タイマーは**見ている人それぞれの端末**で、その人がアバターを読み込んでから数える。後から来た人の画面でも予熱される。
- パラメーター：SDV_Preheat（Bool・同期・保存・初期値 ON）、SDV_Standby（Bool・同期・保存・初期値 OFF）、SDV_PreheatDone（ローカル）。同期は 2bit 増えた（ロボットで合計 63bit）。
- 設定項目：preheatDefault=true、preheatSeconds=180（10〜600）、standbyDefault=false。
- メニュー：Sandevistan の最後に「負荷」フォルダを追加：予熱（読み込み後180秒）／常時待機（常に重い）／残像数（3／5／7／10体）／不透明（軽い）。残像数と不透明は「見た目」から移した。
- 確認（ロボット、Gesture Manager）：
  - 読み込み直後に残像10体が裏で動いている（_Age=1、_Rec=0、isVisible=True）。
  - 残像数を5にすると5体だけになる。180秒経つと全部止まる。
  - 常時待機から発動すると、通常どおり記録される（_Rec=1、_Age が 0.02〜0.77 で進む）。
- 未確認：VRChat の実機で、カクつきが実際に減るか（エディタはシェーダーの準備を裏で行うので測れない）。
- 注意：play モードで `r.material.GetFloat` を読むと、アニメーションの値ではなく元マテリアルの値が返る。アニメーションの値は `GetPropertyBlock` で読む。
- README の「4. 軽さに関わる設定」に「負荷」メニューの説明を追加した。

## 方針
- 配布前提。プレハブをアバター直下に置くだけで、どのHumanoidアバターでも動く。
- 作品名は使わない（内部名は Sandevistan、メニュー名は「アクセルドライブ」で仮置き）。
- 残像は**点群キャプチャ方式**：ParticleSystemのShapeに本体のSkinnedMeshRendererを指定し、縮小した読み取り可能テクスチャで本人の色を写す。ワールド空間に固定し、一定間隔のバーストで形を写し取る。寿命の後半で上昇・揺らぎ・縮小をかけ、崩れて消える。追加の3Dモデルは使わない。
- 時間停止の演出は「発動地点に止まった塵と雨粒」と「装着者だけの画面演出」で代用する。

## ファイル（`Assets/Sandevistan/`）
- `Sandevistan.prefab`：設定、MA Parameters、MA Menu Installer、メニュー（発動／抑制剤／サイコシス有効）。
- `Scripts/SandevistanSettings.cs`（IEditorOnly）：品質（Light/Standard/Full）、元メッシュの指定・除外、持続8秒、クールダウン4秒、色3つ、textureColorKeep、各演出のオンオフ、サイコシス、回復秒数。
- `Scripts/Editor/SandevistanBuild.cs`：生成処理の本体。`Process(avatar, save)`。
- `Scripts/Editor/SandevistanPlugin.cs`：NDMF（Generating、MAより前）。
- `Shaders/`：`Sandevistan/PointAdditive`（_Corrupt で赤化・ちらつき・横ずれ）、`Sandevistan/ScreenTint`（全画面。_VRChatMirrorMode／_VRChatCameraMode のときは描画しない）、`Sandevistan/Implant`（頂点カラーRが発光部、_Glow／_Corrupt）。
- `Textures/T_SDV_Dot.png`。

## ビルド時に生成するもの
- Afterimage/AI_n：面積の大きいSMRを上位4つまで使い、粒数は面積比で配分する。
- Sparks、FrozenBubble（Dust／Rain、発動地点に残る）、ActivateBurst。
- SDV_Glitch（Headの子、サイコシス用）、SDV_Trail（両手両足、TrailRenderer）。
- Implant：背骨チェーン（Spine〜Neck）に沿った7枚のプレートを、1つのSMRとして生成する。背中の表面位置は焼き込んだ頂点から推定する。
- ScreenTint（ローカルのみ）。
- FXコントローラー（MA Merge Animator、Absoluteモード、WDはアバターに合わせる）。

## 同期パラメータ（9bit）
- 同期：SDV_Active（Bool）、SDV_Psycho（Int）。
- ローカル：SDV_Req、SDV_Pill、SDV_Count（保存）、SDV_PsyEnable（保存、初期値1）。

## FXレイヤー
- SDV_Control：Req→Active（Active=1、Count+1）→持続時間で終了またはReq OFF→End→Cooldown。
- SDV_PsychoStage：Countから段階を決める（0〜3→0、4〜6→1、7〜9→2、10以上→3）。
- SDV_PsychoCount：60秒ごとに−1、抑制剤で−4、0〜15に制限。
- SDV_PsychoRandom：段階3のとき、12秒ごとに35%の確率で勝手に発動。
- SDV_Visual、SDV_Screen、SDV_PsychoVisual。
- ローカル判定の層は、Init から IsLocal が真になったときだけ進む（最初のフレームで IsLocal が偽になる問題への対策）。

## 品質プリセット（このアバターでのmaxParticles合計）
- Standard：700粒/0.13秒、寿命0.4〜0.75秒。合計約5,500（残像約4,900）。
- Light（Quest時は自動）：380粒/0.16秒。トレイルと画面演出なし。シェーダーは VRChat/Mobile。
- Full：1,300粒/0.10秒。
- パーティクル数の評価は Very Poor 寄りになる。配布時はREADMEに明記する。

## 判明した落とし穴
- **FBXのスケールが100のSMR（旧テスト用アバター）**：Shapeのスケールが粒サイズや normalOffset に乗る。`scalingMode = Shape` と `normalOffset = 0` で回避した。骨の子にするPSやトレイルは `UnitScale` で親のスケールを打ち消す。
- エディタでの確認：毎フレーム `cam.Render()` でスキニングを更新し、`ps.Simulate(dt, false, false)` で進める。走りは proxy_run_forward を一時的なコントローラーで `Animator.Update` して再生する（`SampleAnimation` だとNaNになる）。
- screenshot-isolated は ScreenTint の巨大なバウンズで画角が崩れる。自前のカメラ→RenderTexture→クアッドで確認する。
- device_commit_files は**同じ stagedPath を使い回すと古い内容が書かれることがある**。毎回別のファイル名で stage する。
- 書き込み後は `AssetDatabase.Refresh` → 約60秒待つ → DLLの更新時刻を確認する。

## 次にやること
0. 実機確認：他の人の画面でも同じように見えるか、FreezeToWorld の挙動、負荷。
1. 実機確認（Gesture Manager または VRChat）：発動、持続、クールダウン、同期、画面演出がローカルのみか、ミラーに映らないか。
2. 効果音（起動・解除・心音）。
3. インプラントの造形改善（必要ならBlenderで作る）。
4. 他のアバターへの導入テスト、Quest Lite の確認、READMEと配布パッケージ。
