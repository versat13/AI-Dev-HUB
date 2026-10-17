# ScrapAI 引き継ぎ（2026-10-17）
種別：extension（Chrome MV3）

## 目的と方針
ページ・X投稿・GitHubリポジトリ・掲示板スレ（ふたば）をローカルに保存し、後で思い出す／AIに解説させる。
仕様書：（非公開）（12章、P0〜P6）
- Chrome Syncは使わない。データは全てIndexedDB（端末内）。移行用にエクスポート/インポートを作る（P5）。
- 保存はボタンを押したときだけ。保存時にAIへ問い合わせない。AI回答は手動（コピー/貼り付け）で取り込む。
- 権限は activeTab / scripting / storage / unlimitedStorage / sidePanel のみ。host_permissions は宣言しない。

## 環境
- WXT 0.21 + Preact + TypeScript(strict) + Dexie 4 + @mozilla/readability + Vitest。
- 準備：`npm install` → `npx wxt prepare`。確認：`npx tsc --noEmit` / `npx vitest run` / `npx wxt build`（出力 dist/chrome-mv3）。
- ビルドは `wxt.config.ts` の hook で host_permissions を削除している（消さないこと）。
- e2e：`e2e/*.mjs`（Playwright+Chromium、localhost用host_permissionsを足した複製で実行）。ヘッドレスでは拡張ページにクリップボード権限を付けられないため、ai.mjsはclipboardを代役に差し替えている。

## 現在の状態（v1.3.6）
- v1.3.6：回答の予備探索は100字以上のものだけ採用（Grokの考え中「Grok 10s 作業しました」を回答として取り込んでいた）。Grokの回答は pre のコードブロック（`data-testid=assistant-message` 内）。
- v1.3.5：Grok対応（一時チャットは `https://grok.com/c#private`、送信ボタン `chat-submit`、回答 `.response-content-markdown`）。送信確認の比較を空白そろえに変更（段落ごとに空行が入る入力欄で「送信済み」と誤判定していた）。回答の取り込みは実機未確認。
- v1.3.4：Gemini設定に「一覧を取得」（ListModels、generateContent対応のみ候補に出す。実キーでは未確認）。
- v1.3.3：Geminiの既定モデルを gemini-3.8 に（旧既定 gemini-2.5-flash は読み込み時に置き換え）。並び順は「項目（保存日/更新日/評価/タイトル/ドメイン）＋昇降順ボタン」（`SortKey` = `field-asc|desc`）。管理タブのツールバーは 列（選択式・カード時のみ）→表示切替（コンパクト/カード/カード大）、画像ボタンは常に表示（AI要約/原文の左）。一括バーは折り返さない。AIサービスの並びは 標準（ChatGPT・Claude・Gemini・Grok・Perplexity）→Gemini API→自作（`getServices`が標準を決まった順に並べる）。Gemini APIキーは前後の空白を除き、ヘッダーで拒否されたら `?key=` で1回やり直す。キー欄に「AIza… / AQ.…」の案内、空白混じり・短すぎは赤字で注意。
- P0〜P6 完了（ストア申請の素材を除く）。ユニットテスト162件、e2e（ui/profiles/ai/data/snapshot/sync/bridge）全通過。`npm run test:e2e`で一括実行。
- P1：保存（URL+タイトルを先に確定、抽出失敗でも残る）、重複検出、範囲選択の断片追加、取り消し。
- P2：ポップアップ=一覧+「このページをスクラップ」ボタン。サイドパネル=一覧+詳細（保存ボタンなし）。管理タブ=一覧/詳細/絞り込み/一括操作/カテゴリ/設定。
- P4：AIテンプレート（組み込み3種+自作）、プロンプトをコピー/ChatGPT・Claude・Geminiを開く（自動入力・送信なし）、回答の貼り付け→固定見出しで構造化（原文は常に保存）、AI要約あり/なし連動、検索対象。
- P5：設定画面でエクスポート/インポート（JSON、`scrapai-export` v1）。含める内容を選択（星・ピン・カテゴリ既定ON）、重複はスキップ（既定）/上書き/別項目、不正ファイルは何も書き込まず拒否。
- 日本語訳：テンプレート「日本語に訳す」→回答の「日本語タイトル」「日本語訳」を「日本語訳を適用」でタイトル（元は`originalTitle`に保持、戻せる）と訳文の断片(source=translation)に反映。検索は両方のタイトル対象。
- P6：ショートカット（`commands`登録のみ・キー未割り当て、保存時はアイコンに✓バッジ）、右クリック「ScrapAIに保存」（設定でオン時のみ`contextMenus`任意権限を要求）、本番アイコン、`PRIVACY.md`、`STORE.md`。カード表示は列数を自動/1〜6で選択（`cardColumns`）。
- v1.0.8 UI刷新：紙(#f6f7f9)+紺インク3段階の強弱、黄色はAI専用。一覧は「あるものだけ表示」（未評価・AIなしは出さない）、相対日付、ドメイン頭文字の印。管理はサイドバー（一覧/アーカイブ/カテゴリ件数）＋絞り込みポップ＋有効条件チップ。詳細は本文/AIタブ、操作は「…」メニュー。AIは①聞く②貼る。
- 見出し：全テンプレートの先頭に「## 見出し」。回答保存時にタイトルを自動置換（設定`aiApplyHeadline`、既定ON）。手でタイトルを編集すると`originalTitle`を消し、そのタイトルが基準になる。旧`jaTitle`も読める。
- v1.3.1（実機の指摘を受けた修正）：
  - 裏タブ送信：送信ボタン→Enterを3秒ごとに試し、入力欄が空になるまで確認（最大15秒）。送れなければ `not-sent` で失敗→タブを手前に出し案内。サービスごとの「裏のタブで開く」（`AiServiceCfg.background`、ChatGPTは既定オフ＝手前で開く）。
  - 「処理中」が戻らない対策：タブ側が8秒ごとに `ai-job running` を送り、UIは30秒連絡が途絶えたら「失敗」に戻す（API実行は連絡がないので120秒）。
  - Gemini API：失敗理由（HTTP番号とAPIの説明文）をボタンのツールチップと詳細のAI欄に表示。詳細の「聞く」に「Gemini API」ボタン（`ai-run` に `serviceId/templateId` を渡す）。カスタムサービスのURLが不正でも例外を出さない（`bad-url`）。
  - カード右側は 翻訳→AI要約 の順。翻訳の失敗理由を分けた（API なし／言語の組み合わせ不可／準備中・失敗）。詳細のAI欄は回答を折りたたみ、「もう一度AIに聞く」を展開。「N件選択中」の幅を確保。
- v1.3.0：
  - AIボタン：ポップアップ・サイドパネルのカード右側に「✦ AI要約」（`ScrapRow.AiRunButton`、押下処理 `ui/ai-run-ui.ts`）。背景の `ai-run`（`handleAiRun`）が、AIサービスのタブを裏（active:false）で開き `aibridge.content.ts` を `auto:true` で注入 → 入力・送信 → 回答の文章が6秒変わらなければ `ai-answer`（auto）で取り込み → `closeOnDone` ならタブを閉じる。失敗（入力欄なし・240秒タイムアウト・保存失敗）は `ai-job` で通知 → タブを手前に出して手動の取り込みボタンで続けられる。状態は `storage.session` の `aiJobs`（`ai-run.ts` の `setJob`、UIは `useAiJobs`）。
  - Gemini API：`ai-run.ts` の `callGemini`（`x-goog-api-key` ヘッダー、URLにキーを入れない）。キーは `storage.local` の `geminiApiKey`（設定・同期・書き出しに入れない）。モデルは設定 `geminiModel`（既定 gemini-2.5-flash）。使うときだけ `generativelanguage.googleapis.com` への任意権限を要求。
  - 管理画面「AI連携」（`ui/AiSettings.tsx`）：AIボタンの送り先/プロンプト、Gemini API、AIサービス（標準3つも編集・初期値に戻す、自作の追加/削除。名前・URL・一時チャットURL・入力欄/送信/回答のセレクタ・自動送信・成功時に閉じる）＋従来のAI共通設定（設定画面から移動）。サービス設定は `settings.aiServices`（null=標準）、`getServices()` で標準の欠けを補う。`ai-bridge.ts` の find* は利用者指定セレクタを先に試す。
  - `optional_host_permissions` を `https://*/*` に変更（実際に求めるのは選んだサービスだけ）。PRIVACY/STORE更新。vitestに `@` の別名を追加。
- v1.2.0：
  - ドメインのアイコン：保存時に `extract.content.ts` がページ自身の `<link rel=icon>`（なければ `/favicon.ico`）を fetch して dataURL で返し、`favicons` 表（DB v7、キーはドメイン）に保存。権限の追加なし。項目が1件もなくなったドメインは `pruneFavicons()` で削除（`deleteScraps`・インポート・同期後）。同期・書き出しの対象外（端末ローカル）。表示は `SourceMark`（`useFavicon`、なければ頭文字）。
  - スナップショット：どのサイトでも保存結果に「撮る」を出す（範囲の設定がなければ画面に見える範囲、ルールのセレクタ `@viewport`）。「次から自動で撮る」は設定のないサイトならドメイン用の自作プロファイルを作る。自動で撮るのは新規・断片追加に加え、上書き保存/新規保存と右クリック・ショートカット保存（`explicit`）でも。
  - ポップアップ：幅460px。カードを押すとポップアップ内に詳細（サイドパネルは開かない）。保存結果の「本文を取得しました」行は廃止（失敗/一部のみ警告）。保存済みのボタンは「上書き保存」「新規保存」。ポップアップ・サイドパネルは50件ずつ（右下に `2 / 5`）。
  - 管理画面：操作バー `BulkBar.tsx`（常時表示・Gmail風。全選択チェック、表示中をすべて選択/選択解除、カテゴリ（チェック/一部は–）、評価1〜5/外す、ピン留め/外す、アーカイブ/復元、その他=スナップショット削除・削除）。ページ送り（`pageSize` 既定50、数字入力）。カードに縮小スナップショット（`listSnapshots`、カード100px/大160px）。詳細のスナップショットも高さ320pxまで。
  - ChatGPTの回答取り込み修正：コードブロックが `pre` でなく `div[data-code-block-source] > code`。改行が失われても見出し前で補う。
  - DBの `versionchange` で警告を出さず接続を閉じ、画面は読み込み直す（"Another connection wants to upgrade" 対策）。
  - 設定：表示は 言語→テーマ→ピン留め→パネル。保存文字数の既定は1000。用語「AIサイト」→「AIサービス」。
- v1.1.0：
  - 同期（管理画面「同期」）：同期フォルダ方式。File System Accessで利用者が選んだフォルダに `scrapai-sync-<端末ID>.json` をPCごとに書き、他PCのファイルを記録ごとに新しい方優先で統合（`sync.ts`）。削除は `tombstones` 表（DB v6、120日保持）で伝える。カテゴリは名前で寄せる。管理画面を開いている間は1分ごと・フォーカス時に自動同期、変化がなければ書かない。Chrome再起動後はフォルダの許可し直しが必要。
  - AIのボタン一つ化：`optional_host_permissions`（chatgpt/claude/gemini）を初回に要求。`aibridge.content.ts` を開いたタブに注入し、入力欄へ自動入力（`aiAutoSend`で送信）、右下「ScrapAIに取り込む」で最後の見出し付きコードブロックを保存。場所は既知のセレクタ→画面の形から推定（`ai-bridge.ts`）。失敗時はコピー＆貼り付け。
  - PRIVACY.md / STORE.md を新機能に合わせて更新（日英の掲載文）。
- v1.0.13：テーマ（ライト既定/ダーク/システム、`data-theme`）。カードに見出しと本文の区切り線。YouTubeはスナップショット「たずねる」。ふたばを組み込みから外した（未編集は削除、編集済みは自作化）。初回サンプル3件（`samples.ts`、`meta.samplesSeeded`で一度だけ）。概要は「タイトルだけの断片」を使わない（DB v5で作り直し）。ポップアップは検索・絞り込み・AI/原文を1行に。
- v1.0.12：カード下段は 出典｜状態｜星（幅固定）｜カテゴリ（表示中の最長に幅を合わせ右端）。カード（大）は表示に関係なく回答のないカードへ最初の断片600字（12行）。AI見出しのタイトルに「AI」印。詳細はタブの上に「AI要約」枠、AIタブは回答があれば回答が先頭・手順は「もう一度AIに聞く」に折りたたみ。詳細ペインは右からスライド表示。インポートのボタン名を「インポート」。
- v1.0.11：
  - プロンプト（旧AIテンプレート、英語 Prompts）：要約（既定）/要点抽出/情報の精査/手順確認/導入判断。構成は「役割→<material>資料→やること→回答の形式」（長文を先・指示を後、資料はタグで囲む、「資料に記載なし」を許可、精査は引用で根拠）。
  - 一覧：「AI要約」表示はタイトルも最新回答の見出し（`aiHeadline`、DB v4）。カード（大）を追加（`Density`）。下段は 出典（表示中の最長ドメイン幅）/状態/カテゴリ右寄せ/星5つ分の幅固定、保存日時は詳細のみ。
  - タイトル整形 `cleanPageTitle`：末尾のサイト名を除去、タイトルが本文を含むなら本文の最初の一文。
  - サイドパネルのピンは削除し、設定「サイドパネルを自動で閉じない」へ。ポップアップの注意書き削除。管理画面は右側だけスクロール。
- v1.0.10：
  - EN方式は見出し・項目名も英語に統一（`headLang = bodyLang`）。画面の見出しは表示言語。翻訳テンプレートは廃止（旧回答は読める）。新テンプレート「使うべきか判断する」（pros/risks/alternatives/verdict）。
  - 一時チャット（`aiTemporaryChat` 既定ON）：ChatGPT `?temporary-chat=true`、Claude `/new?incognito`（未確認）、Geminiは通常。`serviceUrl()`。
  - 一覧の表示切替「AI要約/原文」（`listFace`）。最新回答の要点を `scraps.aiExcerpt` に保持（DB v3で既存分を生成）。
  - カード・詳細の翻訳：Chrome内蔵 Translator/LanguageDetector（Chrome 138+、端末内）。カードの訳は `scraps.translation` に保存、詳細の本文訳は表示のみ。使えない環境ではボタンを出さない。
  - サイドパネル：自前の見出しを削除（Chromeが出す）、フォーカスが外れたら自動で閉じる（「開いたままにする」`panelKeepOpen`）。
  - 削除は2回押し（1回目でボタンが「もう一度押すと削除」に変わる、3秒で戻る）。右クリックメニューの作り直しを直列化（duplicate id 修正）。
  - 設定画面をカード化、データはエクスポート/インポートを対のカードに。サイト一覧のみスクロール。テンプレートは見出し構成つきのカード。アイコン刷新。
- v1.0.9：
  - プロンプト言語：既定はEN（指示英語＋回答は表示言語、見出しは表示言語）、AI欄の「EN/日本語」で切替（`aiPromptLang`）。回答はコードブロックで出させ、パーサは囲みを除去・記号なしの正式見出し行も認識。
  - スナップショット：`SiteProfile.snapshot {mode off/ask/auto, selector('@unit'可), when}`。抽出時に範囲へ`data-scrapai-snap`を付け、backgroundが`captureVisibleTab`→OffscreenCanvasで切り抜きWebPを`snapshots`表（DB v2）へ。新規保存・断片追加のときだけ撮る。Xは画像/動画/カード/引用があるとき「たずねる」。
  - 組み込み追加（BUILTIN_VERSION 2、実ページ未確認）：Zenn, Qiita, note, はてなブログ, DEV, Medium, Wikipedia, Stack Overflow系, Reddit, Hacker News, Bluesky, YouTube。
  - 削除は「…」メニューと一括操作「その他」に確認付き（ConfirmDelete）。カテゴリはワンタップ、並び順にドメイン順、サイドパネルはカード表示。
- P3：サイト別プロファイル（X・GitHub・ふたば）、複数断片、文字数上限、ユーザー編集、要素ピッカー、サイト設定画面。

## 次にやること（優先順）
1. 実機確認の結果を受けた修正（特に実際のAIサイトでの自動入力・取り込み、同期フォルダ）。
2. ストア申請の素材：スクリーンショット（1280×800）、プロモ画像、プライバシーポリシーの公開URL（STORE.md参照）。

## 注意・落とし穴
- Gemini APIの「AQ.」形式キーは実キーで未確認（REST で拒否される報告あり）。Grok/Perplexity の入力欄・送信の自動検出も実サイトで未確認。「Gemini APIボタンでClaudeが使われた」は原因を再現できず未確認。
- activeTab はアイコンをクリックしたタブにだけ付与される → サイドパネルには保存ボタンを置けない。
- IndexedDBは boolean/null をインデックスできない → pinned/archived はメモリ内フィルタ。
- 抽出テキストは必ずプレーンテキストで表示（HTMLとして解釈しない）。
- i18n文言（_locales/*/messages.json）に `*/` を書かない（WXTが生成する型定義が壊れる）。
- 組み込みプロファイルのセレクタはサイト側の変更で合わなくなる。合わなければ汎用抽出に自動で切り替わる。GitHubは実ページ未確認。
- 拡張機能の名前を変えるとフォルダ名・拡張機能IDが変わり、IndexedDBのデータは引き継がれない（P5のエクスポートで移行）。

- ロケールのキーは `[A-Za-z0-9_@]` のみ（ハイフン不可。守らないとChromeが拡張を読み込めない）。locales.test.tsで検査。
- e2eはクラッシュしてもgrepで0件に見えることがある。`passed`行の有無まで確認する。

- 見出しの別名に「タイトル」「title」のような汎用語を足さない（本文中の行を見出しと誤認する）。

- 「次から自動で撮る」を選ぶと組み込みプロファイルが「編集済み」になり、以後の組み込み更新が当たらない（既定に戻すで解除）。
- e2e/snapshot.mjs はテスト用の複製に `<all_urls>` を足している（メッセージ保存では activeTab が付かないため）。

- 設定のないサイトで「次から自動で撮る」を選ぶと `<ドメイン>/**` の自作プロファイル（フィールド空・priority200）が作られる。
- 設定の入力欄は、保存の再描画で入力が消えないよう確定時保存の `CommitInput`（`onBlur` では画面の値を読む）。e2eは `wxt build` し直してから実行する（古い dist で通ったように見える）。
- ページ送りの選択は「表示中のページ」だけ（`pageIds`）。一括操作の対象は絞り込み後の全件のうち選択したもの。
- e2eはインストール直後のサンプルを消してから始める（各mjsの先頭）。

## 未確認
- v1.3.1：ChatGPTの裏タブ送信の実機確認（効かなければ「手前で開く」が既定で働く）、Gemini APIの失敗理由（ツールチップに出る）、翻訳の失敗理由（Chrome 155での実際の原因）。
- v1.3.0：実際のAIサイトで、裏のタブ（非表示）でも入力・送信・回答検出が動くか（Chromeがタイマーを間引くため遅くなる可能性。回答が出そろう判定は6秒）。Gemini APIの実呼び出し（モデル名・無料枠）。Claudeなどが非表示タブで送信ボタンを有効にしない場合は失敗→手前表示になる。
- v1.2.0：実ページでのアイコン取得（別オリジンのアイコンは `/favicon.ico` に頼る）、右クリックでの自動スナップショット（ヘッドレスは `explicit` のメッセージで代用）、ChatGPTの実画面での回答取り込み（保存ページ由来の見本でテスト）、DB更新時の `versionchange` 動作（実機）。
- サイドパネルの自動クローズは、パネルを一度操作（フォーカス）してからページに戻ったときに働く（ポップアップから開いて一度も触らない場合は閉じない）。Chromeの翻訳機能の実機動作、Claudeの`?incognito`。
- 追加した各サイトのセレクタ、Xでのスナップショット（固定ヘッダーとの重なり、長い投稿の下切れ）、実際のAIがコードブロックで返すか。
- 右クリックメニューのオン（許可ダイアログ）と実際の表示、ショートカットキー割り当て後の保存（ヘッドレスe2eでは確認できない）。
- AIサイト（ChatGPT/Claude/Gemini）への実際の貼り付け操作、実機でのクリップボード動作。
- 実機でのツールバークリックによる activeTab 付与、ポップアップからの sidePanel.open の動作。
- GitHub（リポジトリ/Issue）の既定セレクタ。

## 作品ルール
### 配布（GitHub）
- ZIPは作らない。ビルド済み拡張を `Extension/ScrapAI/release/ScrapAI/` にcommitして渡す（フォルダ名は変えない。常に最新版を上書き）。
- 手順：`npx wxt build` → `release/ScrapAI` を `dist/chrome-mv3` で置き換え → HANDOFF/log更新 → commit・push。
- 納品の報告は1行：`https://github.com/versat13/AI-Dev-HUB/tree/main/Extension/ScrapAI/release/ScrapAI`（vX.Y.Z）。ユーザーはcloneしているので、pullしてChromeで「再読み込み」する。
- バージョンはリリースごとに PATCH を +1（MAJOR/MINORは指示時のみ）。`wxt.config.ts` と `package.json` の version を揃え、`release/ScrapAI/manifest.json` の version と一致させる。
### 進め方
- コードを書く前に方針を示し、許可を得る。完了後は指示があるまで次の作業に進まない。
- 応答は日本語・簡潔・結論から。
