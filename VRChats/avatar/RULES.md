# VRChatアバターギミック共通ルール
- 環境（各作品で異なる場合は作品のHANDOFF.mdを優先）：Unity 2022.3.22f1 / VRChat SDK 3.10.5 / Modular Avatar / NDMF / Built-in RP
- Unity MCPで作業する場合：作業前に `EditorApplication.isPlaying` を確認する。スクリプト変更後はMCPが約1分切断される。
- スクリプト修正後は `Library/ScriptAssemblies/` のDLL更新時刻がソースより新しいか確認する（コンパイル失敗時は旧アセンブリのまま動く）。
- 文字列置換でコードを直すとき、行末コメントの後ろに次の文を入れない。CRLFに注意し、置換は一致数を確認する。
- テスト用の複製は `ZZ_` で始まる名前にし、削除は完全一致で行う（前方一致で本体を消した事故あり）。
- 大量にファイルを書き出す前にCドライブの空きを確認する。
