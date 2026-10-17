
## 2026-10-04 修正：エモートが全部ふらふらモーション（サルサ）になる不具合
- 原因：`JS_Action_Dizzy.controller` の **Idle 状態も JS_DizzyPlaceholder を使っていた**。ビルド時の上書きでふらふらモーション（サルサ）に置き換わり、Actionレイヤーでテスト用アバター本来のエモート（ActionL2）より上の層として常に再生されていた。
- 修正：Idle の motion を空のクリップ `Assets/JustShield/Animations/JS_ActionIdle.anim`（guid 471f4e9e296ee574687ce56130db8d62）に変更した。
  - Dizzy／Out は従来どおりプレースホルダー → ふらふらモーション。
  - ふらふらモーション（`dizzyMotion` ＝ JSP_Motion_Dizzy）は独立したまま。
- 確認（再生モード／Gesture Manager）：
  - VRCEmote=8（sleep）：寝転ぶ
  - VRCEmote=2（samba）：別のモーションになる
  - JS_Self_Brk：ふらふらモーションが再生される

## 2026-10-06 配布 v1.0.1 作成
- 出力先：`Distribution/JustShieldParry_v1.0.1/`（プロジェクト直下）
  - `JustShieldParry_v1.0.1.unitypackage`（179エントリ）
  - `JustShieldParry_v1.0.1_FullFX_PCOnly.unitypackage`（226エントリ）
  - `JustShieldParry_PC_v1.0.1.zip`
  - `JustShieldParry_Quest_v1.0.1.zip`
- 作り方：v1.0.0 の2つのパッケージを**差分パッチ**した。
  - `JS_Action_Dizzy.controller`（guid 3d4aa09c…）の asset を修正版に差し替えた。差分は Idle の m_Motion 1行だけ。
  - `JS_ActionIdle.anim` のエントリを追加した。
  - それ以外は v1.0.0 とバイト単位で同一（エクスポートし直しによる意図しない混入を避けるため）。
  - FullFX版は旧スクリプト（10:45バックアップ）のまま。nuv コンパイルエラーの箇所は含まない。
- README：
  - README_FIRST は v1.0.0→v1.0.1 に変更し、【更新履歴】を追加。
  - README_JustShieldParry に「9. 更新履歴」を追加。
  - BOM付きUTF-8・CRLFは維持。
  - 上書きインポートで更新できる（GUIDは同じ）。
- 未確認：空プロジェクトへのインポート（v1.0.0 から引き続き）。

## 2026-10-06 テスト用アバター(別)に v1.0.1（配布用プレハブ）を適用
- 照合：プロジェクト内の `Assets/JustShield` は、v1.0.1 パッケージの全179ファイルと md5 が一致（同じ内容）。そのため再インポートはしていない。
- 適用：`Assets/JustShield/JustShieldParry.prefab`（配布用の軽量版）をテスト用アバター(別)の直下に配置し、シーンを保存した。旧テスト用アバター(固有名は伏せている)は引き続き個人用の FullFX 版。
- NDMF ビルドの確認（テスト用アバター(別)の複製、Sandevistan と併用）：
  - エラーなし、約56秒。
  - 同期パラメーターは 102/256 bit。
  - FX レイヤーは 70（うち JS 50、AD 17）。
  - メニューは Sandevistan と Just シールド。
- 未確認：テスト用アバター(別)の再生モードでの動作、VRChat実機。
