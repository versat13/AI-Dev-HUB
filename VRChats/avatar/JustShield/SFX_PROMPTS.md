# Just Shield Parry 効果音 生成プロンプト（参考音源の解析に基づく）

想定ツール：ElevenLabs Sound Effects など（英語プロンプト・尺指定・Prompt Influence 0.5〜0.7）。各3〜4本生成して選ぶ。
方針：参考音源の「構成（層・尺・帯域・音程の動き）」は踏襲し、音色は別物（エネルギー障壁／結晶）に寄せる。

## 解析まとめ（48kHz）
| 音 | 尺 | 構成 |
|---|---|---|
| guardon（展開） | 0.23s | 10msの柔らかい立ち上がり→90〜100Hzの「ボフッ」＋400〜600Hzの胴、3〜7kHzの短い空気感が0.09sで消える、低域の余韻 |
| guardoff（解除） | 0.11s | ごく短い90Hzの「トゥッ」＋300〜600Hz、かすかな高域、しぼむ感じ |
| shieldguard（通常ガード） | 0.25s | 50〜200Hzが8割の重い「ドスッ」、400〜650Hzの胴、高域ほぼ無し、こもった打撃 |
| justshield（ジャスガ） | 0.48s | 全帯域の鋭いアタック→0.1sまで90Hzの強い衝撃→2.3〜5kHzの金属的なきらめきが上昇気味（4.0→5.1kHz）に0.4sかけて減衰 |
| guardbreak（ブレイク） | 1.4s | 全帯域の破砕アタック→30〜46Hzの重低音が約30〜50ms周期でうねりながら持続、2.0〜2.1kHzの鳴き、高域の破片が1.05sで消える、長い低音の尾 |

## プロンプト
### guardon（展開／0.3s）
Soft magical energy shield powering on, a quick rounded low "whomp" swelling in around 90 Hz with a warm hollow body, a brief airy crystalline shimmer on top that cuts off quickly, smooth and clean, no music, no voice, game UI sound effect, close and dry.

### guardoff（解除／0.2s ※生成後0.12sに切る）
Tiny soft deflating pop of an energy bubble switching off, short muffled low "thup" with a quick downward fade, subtle faint air, very short and clean, game sound effect, dry.

### shieldguard（通常ガード／0.3s）
Heavy dull impact absorbed by a thick energy barrier, deep muffled "thud" with strong sub-bass punch and a dense wooden-like mid body, almost no high frequencies, tight and punchy, short decay, fighting game block sound, no metallic ring, dry.

### justshield（ジャスガ／0.6s）
Perfect parry in a fighting game: an instant razor-sharp crack transient, a powerful short low-end punch, then a bright sparkling crystalline chime that shimmers and rises slightly in pitch while fading out over half a second, glassy metallic glints, satisfying and crisp, rich layered sound, no music, no voice.

### guardbreak（ブレイク／1.5s）
Energy shield shattering: a violent broadband glass-and-crystal crash, followed by a deep sub-bass rumble around 40 Hz that wobbles and pulses rapidly, a short metallic ringing tone around 2 kHz, scattered glass shards tinkling and fading within a second, then a long low rumble tail, dramatic fighting game shield break, rich and heavy, no music, no voice.

## リッチさを出すコツ
- 1本で完成させず「アタック」「低音」「きらめき」を別々に生成して重ねる（例：justshield = crack＋low punch＋crystal chime）。
- 尺は少し長めに生成し、Audacity等で頭を詰めてフェードアウト。ピークは-1dBで揃える。
- 似すぎ防止：ピッチを±2〜3半音ずらす、きらめきの音色を変える。
- 規約確認：生成サービスの商用・再配布条件をBOOTH配布前に確認。
