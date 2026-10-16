# EarWorld 進捗メモ v3（2026-10-02 更新、引継書v2の続き）

## 環境
- Unity: <UnityProjects>\AIworlds_IvanMurzak / シーン Assets/Scenes/VRCDefaultWorldScene.unity
- Blender: Documents\Blender\AI_ワールド制作_v2.blend（生成スクリプト: gen_tunnels.py / gen_caves.py / gen_earcam.py / gen_lounge.py / gen_door.py）
- FBX: bake_space_transform=True, -Z forward, Y up。Unity(x,y,z)=Blender(-x,z,-y)。トンネルは (x0+bx,-8+bz,3+by)、Y180°
- U# .asset 自動生成: Assets/Editor/UdonSharpProgramAssetAutoGenerator.cs（abstract/generic除外済み）
- QvPen 3.3.15 / YamaPlayer
- ミニPC: 同期Bakeは20分以上かかり固まる。Bakeは Unity を前面にして GPU・res6・bounce1・1024・AOオフで約90秒
- MCPのスクリプト実行は Unity が非アクティブだとドメインリロードで止まることがある（少し待てば復帰）

## 主な仕組み
- トンネルA〜F（x=0,14,28,42,56,84 / L=110,150,130,200,170,180）。シール6枚
- シール↔トンネルは固定（シールn番=トンネルn番、SealTunnelMap はランダム廃止）
- シールの見た目: EarWorld/SealHole（視差で奥へ続く穴、奥は真っ黒）。マテリアル Assets/Materials/Seal_A〜F（_Theme 0〜5: 耳穴/血管/パステル渦/星空/水底/岩）
- 貼付中の目印: SealVisual が棒の入っていないシールから3秒ごとに薄い煙（Props/SealSmokeFx、テーマ色）
- EarPickTracker: 深さはワールド単位、speed=1500, deadZone 1cm, 抜けヒステリシス, 体に貼ったシールのみ
- 描画負荷: B〜Fは TunnelGroup_B〜F、使用中だけ表示。Aは常時表示
- 暗さ: 棒ライトON中のトンネルだけ点灯（_Udon_LitTunnel、LitGroup_A〜F）
- 音: Assets/Audio/Synth（amb_A〜F, sfx_*、sfx_pinata）。環境音はモニターの TunnelAmbience
- 声: EarVoiceRouter（A内⇄装着者の双方向。実際の距離×muffleNear(0.6)/muffleFar(2.5)で減衰＋VRChatの距離ローパス、Gainで補正。穴→装着者0.8倍、装着者→穴は入口から奥へ1→0.35倍。入口=Path_A_00）※実機で要調整
- ファンシー穴(C): 額縁9枚（Album_C/Frame_01〜09、写真1〜9、大きさ約3倍、広い区間 k=13〜37）。AlbumTilt でカメラ接近時に手前の辺を軸に最大35°起き上がる
- ピニャータ: TunnelGroup_C/Pinata（最奥、揺れる）。カメラ1.8m以内で割れる（紙吹雪・お菓子・プー音をモニターから）、10m離れるか非表示で復活
- リセットボタン: シール・小物・耳かき棒・持ち運びモニター（位置のみ、開閉は維持）
- 部屋: ベッドはコリジョンなし（座る判定のみ）、横寝の頭側を8°上げ。丸椅子に StoolStation（通常の座り）
- 貼り紙: 北壁 Poster_AttachToMe（Assets/Textures/Poster_AttachToMe.png、BIZ UDPGothic で生成）
- モニター底面のZファイト: PM_Base の Bumper 底面を1.5mm下げたメッシュ（Assets/Models/PM_Base_fix.asset）

## 確認済み（Play）
- 6本すべてで挿入→カメラ切替・ライト連動・深さ・抜け判定・巨大棒（Aのみ）、例外なし
- 額縁の起き上がり、ピニャータの割れ/復活、例外なし

## 未完・次
- 実機確認: 声のこもり具合・音量、横寝の頭の高さ、丸椅子、煙の見え方、シールの見た目
- ライト再Bake（ポスター・家具変更後）
- 耳かきの先端付け替え、海外チル部屋の本作り、シェーダーフェス展示
- 最適化と公開準備
