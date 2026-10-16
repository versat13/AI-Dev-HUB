# EarWorld 引き継ぎ（2026-10-02 時点、v3）
種別：world　詳細：同じフォルダの `PROGRESS.md`

## 目的と方針
- 体に貼ったシール（耳穴）に耳かき棒を入れると、対応するトンネルの中をカメラで見られるワールド。トンネル A〜F の6本。
- リアルタイムライトは使わない（`../RULES.md`）。

## 環境
- Unity プロジェクト AIworlds_IvanMurzak、シーン `Assets/Scenes/VRCDefaultWorldScene.unity`（パスの詳細は PROGRESS.md）。
- Blender：AI_ワールド制作_v2.blend と生成スクリプト（gen_tunnels.py ほか）。FBX は bake_space_transform=True、-Z forward、Y up。Unity(x,y,z)=Blender(-x,z,-y)。
- U# .asset 自動生成：`Assets/Editor/UdonSharpProgramAssetAutoGenerator.cs`。QvPen 3.3.15 / YamaPlayer。
- ミニPC：同期Bakeは固まる。Bake は Unity を前面にして GPU・res6・bounce1・1024・AOオフ（約90秒）。
- MCP のスクリプト実行は Unity が非アクティブだと止まることがある（少し待てば復帰）。

## 現在の状態（できていること）
- シール n 番＝トンネル n 番（固定）。挿入→カメラ切替・ライト連動・深さ・抜け判定を6本すべて Play で確認済み。
- 描画負荷対策（使用中のトンネルだけ表示）、暗さ（棒ライトON中のトンネルだけ点灯）、環境音、声の減衰（EarVoiceRouter）。
- トンネルC：額縁9枚の起き上がり、ピニャータ（割れる/復活）。リセットボタン、ベッド・丸椅子、貼り紙。

## 次にやること（優先順）
1. 実機確認：声のこもり具合・音量、横寝の頭の高さ、丸椅子、煙の見え方、シールの見た目。
2. ライト再Bake（ポスター・家具変更後）。
3. 耳かきの先端付け替え、海外チル部屋の本作り、シェーダーフェス展示。
4. 最適化と公開準備。

## 注意・落とし穴
- EarVoiceRouter の減衰値（muffleNear 0.6 / muffleFar 2.5 等）は実機で要調整。
- モニター底面のZファイトは PM_Base_fix.asset で対処済み（元メッシュに戻さない）。

## 未確認
- VRChat 実機での全般（特に声）。
