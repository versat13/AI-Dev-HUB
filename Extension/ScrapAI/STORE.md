# Chrome ウェブストア掲載用

## 名前
ScrapAI — 保存して、AIで5秒で思い出す / Save it, recall it in 5 seconds with AI

## 概要（132字以内）
### 日本語
気になったページや投稿をボタン1つで保存。使っているAI（ChatGPT・Claude・Gemini）で要約し、一覧で5秒で思い出せます。データは端末の中だけ、追加料金なし。

### English
Save pages and posts with one click, summarize them with the AI you already use (ChatGPT, Claude, Gemini), and recall them in seconds. Data stays on your device.

## 詳細説明（日本語）
保存した記事やポストが、なぜ保存したのか分からないまま溜まっていませんか。ScrapAI は「保存する」と「あとで思い出せる」をつなぐ、ローカル保存のスクラップ帳です。

■ ボタン1つで保存
・ページ全体でも、範囲選択した一部だけでも保存できます。
・X・Bluesky・Reddit・Zenn・Qiita・note・GitHub・YouTube などは、投稿や本文を見分けて切り抜きます。
・画像や動画つきの投稿は、見た目のまま画像（スナップショット）でも残せます。

■ いつものAIで要約して、一覧が読める
・「要約」「要点抽出」「情報の精査」「手順確認」「導入判断」から選ぶだけで、最適なプロンプトを作ります。
・ボタン1つで ChatGPT・Claude・Gemini を開いて入力し、回答もボタン1つで取り込みます（一時チャットにも対応）。
・回答は見出しごとに保存され、一覧のカードがAIの見出しと要点に置き換わります。「原文」に切り替えればいつでも元の内容へ。
・カードの「AI要約」ボタンで、裏でAIのタブを開いて要約を取り込み、タブを閉じます。AIサービスは自分で追加もできます。
・APIキーも追加料金も不要。いつも使っているAIをそのまま使います（無料枠のGemini APIキーを入れれば、タブを開かずに要約することもできます）。

■ 探しやすい
・検索、星、カテゴリ、ピン留め、絞り込み、カード表示（列数・大きさを選べる）。
・外国語のページは、Chrome内蔵の翻訳でカードごとに訳せます。

■ データはあなたのもの
・保存先はブラウザの中だけ。開発者のサーバーはありません。
・複数のPCで使うときは、Google Drive・Dropbox・OneDrive が同期しているフォルダを選ぶだけで同期できます。
・JSONでエクスポート／インポートもできます。

■ 必要な権限は最小限
・保存を押したタブだけを読みます（すべてのサイトへのアクセス権は求めません）。
・右クリックメニューとAIサイトへの入力は、使うときだけ許可を求めます。

## Detailed description (English)
Do your saved articles and posts pile up until you forget why you saved them? ScrapAI is a local-first scrapbook that connects saving with remembering.

■ Save with one click
- Save a whole page or just a selection.
- On X, Bluesky, Reddit, Zenn, Qiita, note, GitHub, YouTube and more, it clips the actual post or article.
- Keep posts with images or video as a snapshot image too.

■ Summarize with the AI you already use
- Pick Summarize, Key points, Fact-check, Steps to try or Decide, and ScrapAI writes the prompt.
- One click opens ChatGPT, Claude or Gemini with the prompt filled in; one more click brings the answer back (temporary chats supported).
- Answers are saved by heading, and your cards show the AI headline and key points. Switch to “Original” at any time.
- A “Summarize” button on each card opens the AI tab in the background, imports the summary and closes the tab. You can add your own AI services.
- No API key and no extra fees needed; use the AI you already use (or add a free-tier Gemini API key to summarize without opening a tab).

■ Easy to find
- Search, stars, categories, pins, filters, and card layouts with adjustable columns and size.
- Translate foreign-language cards with Chrome’s built-in translator.

■ Your data stays yours
- Stored only in your browser. No developer server.
- Sync across computers by choosing a folder kept in sync by Google Drive, Dropbox or OneDrive.
- Export and import as JSON.

■ Minimal permissions
- Reads only the tab you save. No access to all websites.
- Context menu and AI-site access are requested only when you use them.

## 単一目的（審査用）
ユーザーが選んだWebページの内容を端末内に保存し、後から探して読み返せるようにする（AIに要約させる補助を含む）。

## 権限の説明（審査用）
- activeTab / scripting: ユーザーが保存を押した時点の現在のタブから本文を取り出す・スナップショットを撮るため。常時のサイトアクセスはしない。
- storage / unlimitedStorage: 設定と、保存した項目・画像を端末内に保存するため。
- sidePanel: サイドパネルで一覧を表示するため。
- contextMenus（任意）: 設定でオンにしたときだけ右クリックメニューを出すため。
- optional_host_permissions（https://*/*。実際に許可を求めるのは、ユーザーが選んだAIサービスと generativelanguage.googleapis.com だけ）: 「AI要約」ボタン・「ボタン一つでAIに渡す」で、ScrapAIが開いたタブの入力欄にプロンプトを入れ、回答を読み取るため。Gemini APIは、ユーザーがキーを入れたときだけ本文を送るため。使うサービスごとにその都度許可を求める。

## データの扱い（ストアの申告）
- 収集するユーザーデータ: なし（すべて端末内。開発者のサーバーへの送信なし。ユーザーがGemini APIキーを入れた場合のみ、本文がGoogleに送られる）
- 販売・第三者への提供: なし

## 申請前に必要な素材
- スクリーンショット 1280×800 を3〜5枚: ①カード一覧（AI要約の表示）②詳細とAI要約 ③AIサイトの「取り込む」ボタン ④同期の画面 ⑤ダークモード
- 小さなプロモ画像 440×280
- プライバシーポリシーの公開URL（PRIVACY.md をGitHub Pages等で公開）
