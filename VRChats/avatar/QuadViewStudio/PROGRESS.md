# QuadView Studio（四面図撮影スタジオ）進捗メモ 2026-10-07（配布用 v1.1.0 作成済み・実機未確認）

旧名は TriView Studio（三面図スタジオ）。4方向を撮るので、2026-10-07 に名前を変えた。

## 現在の状態
- 配布用 `Assets/QuadViewStudio/Dist~/QuadViewStudio_v1.1.0.zip` を作成した（164,375 bytes）
  - 中身は unitypackage（61ファイル）と README（UTF-8 BOM付き、CRLF）
  - 「Claude outputs」フォルダと Dist~ はパッケージに含めていない
  - Dist~ には、旧名の TriViewStudio_v1.1.0.zip と、確認用の画像 `_check_hint.png` `_check_panel.png` が残っている（不要なら削除してよい）
- 導入先：シーン `Assets/ギミックテスト1.unity` の「Tutorial_Robot_三面図」（オブジェクト名は QuadViewStudio。シーン保存済み）
  - 「テスト用アバター(旧)」のインスタンスは、名前変更の時点でシーン内に見つからなかった（別シーンにあるか、外されている可能性がある）
- 接続フォルダ：`<UnityProjects>\GimmickAI_1\Assets\QuadViewStudio`
  - device_stage_files が使える。旧フォルダ（TriViewStudio）は名前変更でなくなった
- 各ファイルの MD5（Unity と手元で一致を確認済み）
  - Editor/QuadViewStudioBuilder.cs：19486b12a63ef47d3a128343fda1291a
  - Shaders/QVS_Panel.shader：c441c2ef0b4e8a56188d53ac4f3d0069
  - Shaders/QVS_Unlit.shader：5423b86f8d15842b7dba5f98dee8a973
  - Editor/QuadViewStudio.Editor.asmdef：7b25ad3cdfaa211f01709ad08c38f487
  - README_QuadViewStudio.txt：10901bb33dadf546c3809d2f8e06a763
  - Textures/QVS_Hint.png：834c266c3b70f63519cb161ab44727e3（1280×720、32色）
- ファイル転送は gzip→base64 で行う。長い base64 は、約5KBずつに分けて、チャンクごとに MD5 を照合しながら追記する（一度に長く写すと崩れることがあった）

## 名前変更（2026-10-07）
- フォルダ・Prefab・ビルダー・asmdef・メニュー（Tools/QuadViewStudio/Rebuild Prefab）・シェーダー名（QuadViewStudio/Panel, Unlit）を変えた
- 接頭辞を TVS_ → QVS_（アセット）、TVS/ → QVS/（パラメータ）、レイヤー名を "QVS ..." にした
- Expressionメニューは「四面図スタジオ」。README も四面図に直した（ただし「三面図として使うときは、左側面を外してください」は残した）
- フォルダの GUID は保たれ、アバター上の Prefab とのつながりも維持された
- フォルダの名前変更は、Claude アプリがフォルダを接続中だったため「アクセスが拒否されました」になった。Unity のエラーダイアログを閉じたら完了した
- 案内画像を 16:9 で作り直した
  - 内容：「四面図スタジオ」「撮影者がパネルの共有（グローバル）をOFFにしている」「座り方」と英語の説明
  - PrepTexture に npotScale=None を追加した（1024×512 に縮められていたため）

## v1.1.0 の主な仕様
- カメラは High（3840×2160・MSAA×4）と Low（1280×720）の2系統。QVS Render レイヤー（9状態）で出し分ける
- パネル調整：パネル表示 / パネル低負荷：グローバル / パネル高負荷：グローバル / カメラに上書き：ローカル / カメラに上書き：グローバル / 高さ / 身長計
- パネルの角度（-90°）と距離（1.6m）は固定。座席とカメラは Content/Turn で回して、パネルの方を向かせる
- 各面は 16:9 の2×2。パネルは 1.6m × 0.9m。正射影カメラにはパネル・案内画像・ガイドを描画しない
- 同期は 61bit（Light と Shoot 以外。ShootG は保存しない）

## 検証結果（名前変更後）
- 表示の出し分け：10パターンすべて仕様どおり
- レイヤー間の競合：78キーで0件。パスの欠け：0件
- 案内画像がパネルに 16:9 で正しく表示されることを、描画して確認した
- パフォーマンス（Tutorial_Robot_三面図）：全体 Poor（ライト1灯）、AABB Medium、マテリアル Medium（9個）
  - マテリアルの改善案：Preview と Overlay を1つずつにし、マテリアルの差し替えアニメーションで High/Low を切り替える

## これまでの教訓
- 同じ Transform の position / rotation / scale を、複数のレイヤーで成分を分けて動かさない。回転のクリップは 180° 未満の刻みで並べる
- 撮影モード用 Quad のバウンドは (4,3,4)。大きくすると AABB が Very Poor になる
- Prefab を直接編集したときは、ビルダーにも反映する（再生成で元に戻るため）
- 接続中のフォルダは、Windows のロックで名前を変えられないことがある

## 実機で確認すること
- パネル：自分は高画質。周りの人には、低負荷で低画質、高負荷で高画質、両方OFFで案内画像が出るか
- カメラに上書き：ローカルとグローバル。両方ONで、自分の写真が二重にならないか
- 座った人がパネルの方を向くか。前傾で体も傾くか
- 降りた後にトラッキングが戻るか
- VR で配信カメラを使ったときに、視界が覆われないか
