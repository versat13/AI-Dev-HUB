# Just Shield Parry（旧 JustShield）引き継ぎ 2026-10-03（配布v1.0.0作成・個人用FullFX化済み）

現状：主要機能は実装済み。NDMFビルドは警告なし。アバターごとのデータはNDMFプラグインでビルド時に自動生成。同期41bit。PC軽量化（パーティクル36→16）とQuest Lite自動切替を実装。**配布ZIP v1.0.0を作成（コンパイルエラー修正後に作り直し済み）**。**手元のシーンは個人用FullFX版＋参考音源**に差し替え。次はファルコンパンチ（センダーFire、攻撃側Senderキットと一緒に）。

## 目的と方針
- VRChatアバターギミック。スマブラ風ジャストシールド。BOOTH配布予定。商品名「**Just Shield Parry**」、メニュー表示名「**Just シールド**」（内部名・シェーダー名・フォルダは JustShield のまま）。
- 開発用アバター「テスト用アバター」。シーン `Assets/テスト用アバターギミックテスト2.unity`、素材 `Assets/JustShield/`。
- Unity MCP（ai-game-developer）で作業。Modular Avatar 1.18.7 / NDMF 1.14.8 / VRChat SDK Avatars 3.10.5。
- ユーザー指示：簡潔に結論から。コード前に方針提示→許可。
- 意向：原作再現＋3Dの外連味OK。エフェクトは「くっきりメリハリ」。モーション再生はふらふら中のみ有効。

## 配布物（`Distribution/JustShieldParry_v1.0.0/`、プロジェクト直下）
- `JustShieldParry_v1.0.0.unitypackage`（軽量版。PC/Quest自動切替。178ファイル、約1.3MB）
- `JustShieldParry_PC_v1.0.0.zip` / `JustShieldParry_Quest_v1.0.0.zip`（同じパッケージ＋README＋README_FIRST_PC/Quest、BOM付きUTF-8・CRLF）
- `JustShieldParry_v1.0.0_FullFX_PCOnly.unitypackage`（軽量化前バックアップから直接tar.gz生成。パーティクル36、Quest Lite非対応、PC専用）
- 【要記入】：利用規約・問い合わせ・価格。
- 2026-10-03 13:3x：`JustShieldBuild.cs` 153行目のコメント混入（`var nuv` がコメント内）でコンパイルエラーだったのを修正し、ZIPを作り直し（パッケージ内の修正済みを確認）。

## 手元（個人用）の構成
- シーンのJustShieldは `Assets/JustShield/_Personal/JustShieldParry_FullFX.prefab`（軽量化前バックアップのプレハブ、新GUID）のインスタンス。スクリプトは最新版を共用。
- 効果音は参考音源 `Audio/Reference/REF_*`（guardon/guardoff/shieldguard/justshield/guardbreak）。ふらふらモーション JSP_Motion_Dizzy、体の演出 Body/arm v。
- 配布用プレハブ `JustShieldParry.prefab`（軽量版）はそのまま残す。書き出しは配布用プレハブ基準なので _Personal と REF は含まれない。

## バックアップ（Assets外、.meta込み）
- `Backups/JustShieldParry_20261003_1040/`、`Backups/JustShieldParry_20261003_1045_beforeOptimize/`（PC軽量化直前）。旧 `Assets/JustShield/_Backup_20261003/` も残存。

## PC軽量化
- パーティクル36→16、最大合計497、メッシュパーティクル1320ポリゴン、マテリアル `M_JS_FX_Add` / `M_JS_FX_Alpha`（アトラス `T_JS_FXAtlas.png` 4×4）。
- 統合：バーストを時間差（最小0.03s）で並べ、start系を階段カーブ（TwoCurves、tangent=Infinity）、startColorはFixed Gradient（「t以上で最初のキー」）、startFrameも階段カーブ。**TSAのstartFrameはスクリプトでは正規化値（frame/16）、Constantは1でクランプ**。
- `stripDebugOnUpload` オプション。

## Quest Lite（ビルド対象Android/iOSで自動）
- 判定表示・BodyFX・AudioSource・SoundFX削除、方向レシーバーはDir0_0のみ（コンタクト15）、パーティクルは JustFX/FX_Glow と BreakFX/FX_Rings、全て `VRChat/Mobile/Particles/Additive`（1マテリアル）。
- シールド本体：メッシュ複製＋UVをアトラスのセル14（グラデーション）＋頂点カラー（**colors32必須**）。色は `defHue` 固定。アトラス512px、ASTC_6x6（エディタはDXT5）。
- メニューから「シールド」「調整/音量」を除去。`JustShieldBuild.ForceLite = true` でPCのままテスト可。
- 手順：VRChat SDK Builderでプラットフォームを Android に切替→Build & Publish（同じアバターID）。アバター本体のQuest対応は別途必要（READMEに追記済み）。
- FullFX個人用プレハブでAndroidビルドするとLite対象のパーティクル名が無いため、エフェクト0になる（個人用はPC前提）。

## 同期パラメータ（41bit）
- 同期：JS_Self_On / JS_View_On / JS_Auto / JS_Self_Evt / JS_BreakOn / JS_Self_HP / JS_Self_Brk / JS_On / JS_Mode / JS_Hemi / JS_Win / JS_MxI / JS_MxV。見た目調整7つは時分割同期（最大約2秒遅れ）。

## メニュー
- Just シールド ＞ シールド展開 / 自動ジャスガ / シールドブレイク / シールド(色・透明度・形状・半球) / 調整(高さ・前後・サイズ・音量) / ガードポーズ(5) / DEBUG(判定(身体タグ・道具タグ・相手判定モード・判定表示)・疑似被弾×4)。

## ビルド時自動生成（NDMFプラグイン）
- `Scripts/Editor/JustShieldBuild.cs`：Generatingフェーズ、MAより前。Place・タグ・音・初期値→(Lite or StripDebug)→SE長さ（SoundFX、Absolute）→体の演出（BodyFX、Absolute）→ふらふら（ActionFX）→判定表示アトラス。
- MAのRelativeモードではOverride先の生成クリップのパスが書き換えられない → 生成クリップはAbsoluteモード＋絶対パスで。

## MCP作業の注意
- スクリプトは `public class X{ public static string Main() }`。ローカル変数名衝突でCS0136。
- **作業前に `EditorApplication.isPlaying` を確認**。スクリプト変更後はMCP切断→50〜60秒待つ。
- **スクリプト修正後は `Library/ScriptAssemblies/Assembly-CSharp-Editor.dll` の更新時刻がソースより新しいか確認**（コンパイル失敗時は旧アセンブリのまま動き、検証が素通りする）。
- 文字列置換でコードを編集するとき、行末コメントの後ろに次の文が入らないよう注意。
- 検証は複製に `nadena.dev.ndmf.AvatarProcessor.ProcessAvatar`。
- エディタでのパーティクル確認：Instantiate→`ps.Simulate(t)`→自前カメラでRenderTexture→Unlitクアッドに貼って screenshot-isolated。
- プレハブ構造変更は `PrefabUtility.LoadPrefabContents`→編集→`SaveAsPrefabAsset`。

## 確認状況
- 未確認：配布パッケージの空プロジェクトへのインポート、統合後のパーティクル見た目（実機）、Quest実機アップロード、時分割同期（2人）、ポーズ②④、音量、他アバター導入、FullFX個人版の実機。

## 次にやること
1. 空プロジェクトで配布パッケージのインポート確認。
2. 実機確認。
3. ファルコンパンチ＋攻撃側Senderキット（Fire）。
4. 配布：【要記入】埋め。
