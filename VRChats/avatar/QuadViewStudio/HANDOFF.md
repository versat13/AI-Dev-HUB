# QuadView Studio（四面図スタジオ）引き継ぎ（2026-10-07 時点、v1.1.0）
種別：avatar　詳細：同じフォルダの `PROGRESS.md`

## 目的と方針
- アバターの四面図（正面・右・背面・左）を撮るためのアバター用撮影スタジオ。旧名 TriView Studio（三面図）。
- 配布用 v1.1.0 を作成済み。実機は未確認。

## 環境
- プロジェクト GimmickAI_1。接続フォルダ `Assets/QuadViewStudio`（パスの詳細は PROGRESS.md）。
- 導入先：シーン `Assets/ギミックテスト1.unity` の Tutorial_Robot_三面図（オブジェクト名 QuadViewStudio）。
- 配布物：`Assets/QuadViewStudio/Dist~/QuadViewStudio_v1.1.0.zip`（unitypackage 61ファイル＋README、UTF-8 BOM・CRLF）。
- メニュー：Tools/QuadViewStudio/Rebuild Prefab。接頭辞はアセット `QVS_`、パラメーター `QVS/`。

## 現在の状態（できていること）
- カメラ2系統（High 3840×2160・MSAA×4 / Low 1280×720）、QVS Render レイヤー（9状態）で出し分け。
- パネル 1.6m×0.9m（16:9 の2×2）、角度と距離は固定。座席とカメラを回してパネルを向かせる。同期 61bit。
- 表示の出し分け10パターン、レイヤー競合0件、パスの欠け0件を確認済み。

## 次にやること（優先順）
1. 実機確認：パネルの画質（自分/他人、低負荷/高負荷、両方OFFで案内画像）、カメラ上書き（ローカル/グローバル、二重にならないか）、座った人の向き・前傾、降りた後のトラッキング、VR配信カメラで視界が覆われないか。
2. 必要ならマテリアル削減（Preview と Overlay を1つずつにし、差し替えアニメで High/Low 切替）。
3. Dist~ の不要ファイル（旧名ZIP、確認用画像）の整理（ユーザー判断）。

## 注意・落とし穴
- 同じ Transform の position/rotation/scale を複数レイヤーで分けて動かさない。回転クリップは 180° 未満の刻みで並べる。
- 撮影モード用 Quad のバウンドは (4,3,4)。大きくすると AABB が Very Poor。
- Prefab を直接編集したらビルダーにも反映する（再生成で戻るため）。
- 接続中のフォルダは Windows のロックで名前変更できないことがある。
- ファイル転送は gzip→base64、約5KBずつ MD5 照合しながら追記する。

## 未確認
- VRChat 実機での動作全般。テスト用アバター(旧。固有名は伏せている)側のインスタンスの所在。
