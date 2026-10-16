# プライバシーポリシー / Privacy Policy

最終更新: 2026-10-16

## 日本語

ScrapAI は、あなたが保存したページの情報を **お使いのブラウザの中（IndexedDB）にだけ** 保存します。開発者はサーバーを持たず、あなたのデータを受け取りません。

- **外部への送信はありません。** アクセス解析・広告・トラッキングもありません。
- **AIのAPIは呼びません。** AIに渡すときは、あなたが選んだAIサービス（ChatGPT・Claude・Gemini）の画面を開き、プロンプトを入力欄に入れます（設定でコピー＆貼り付けにもできます）。その後の扱いは各AIサービスの規約に従います。
- **同期はあなたのフォルダだけを使います。** 同期を使う場合、あなたが選んだPC上のフォルダにファイルを書き出し、読み込みます。そのフォルダをクラウドと同期するかどうかは、あなたが使うクラウドサービス（Google Drive など）の設定によります。
- **保存するのは、あなたが保存を実行したページだけです。** 閲覧履歴を自動で集めることはありません。
- **保存する内容:** ページのURL・タイトル、抽出した本文、あなたのメモ・星・カテゴリ、AIの回答、ページの一部の画像（スナップショット）、サイトのアイコン（保存したページ自身が読み込むもの）、サイト設定、プロンプト、表示設定。
- **翻訳:** カードの翻訳は Chrome に内蔵された翻訳機能を使い、端末の中で行います。
- **データの削除:** 拡張機能の画面から項目を削除できます。拡張機能を削除すると、保存したデータも消えます（必要なら先にエクスポートしてください）。

### 権限の用途
| 権限 | 用途 |
|---|---|
| activeTab | 保存を実行した（アイコン・ショートカット・右クリック）その時の現在のタブだけを読む。スナップショットの撮影にも使う |
| scripting | その時点でだけ、ページから本文を取り出す・範囲を選ぶ・AIサイトにプロンプトを入れるスクリプトを実行する |
| storage | 設定を保存する |
| unlimitedStorage | 保存した項目や画像が多くなっても保存できるようにする |
| sidePanel | サイドパネルで一覧を表示する |
| contextMenus（任意） | 設定でオンにしたときだけ、右クリックメニューに「ScrapAIに保存」を出す |
| chatgpt.com / claude.ai / gemini.google.com へのアクセス（任意） | 「ボタン一つでAIに渡す」を初めて使うときだけ許可を求める。ScrapAIから開いたそのタブでだけ、入力欄にプロンプトを入れ、あなたが「取り込む」を押したときに回答を読み取る |

すべてのサイトへのアクセス権（全サイトの host_permissions）は要求しません。

## English

ScrapAI stores the pages you save **only inside your browser (IndexedDB)**. The developer runs no server and never receives your data.

- **Nothing is sent to the developer or any third party.** No analytics, ads or tracking.
- **No AI API is called.** To use an AI, ScrapAI opens the AI service you choose (ChatGPT, Claude or Gemini) and fills in the prompt (or you can copy and paste). What happens next is governed by that service’s terms.
- **Sync uses only your own folder.** If you use sync, ScrapAI writes and reads a file in a folder on your computer that you choose. Whether that folder is synced to the cloud depends on your own cloud app (such as Google Drive).
- **Only pages you explicitly save are stored.** Browsing history is never collected.
- **Stored:** page URL and title, extracted text, your notes, stars and categories, AI answers, images of part of a page (snapshots), site icons (the ones the saved page itself loads), site settings, prompts and display settings.
- **Translation** uses Chrome’s built-in on-device translator.
- **Deletion:** delete items from the extension’s screens. Uninstalling deletes all data (export first if needed).

### Permissions
| Permission | Purpose |
|---|---|
| activeTab | Read the current tab only at the moment you save (icon, shortcut, context menu); also used for snapshots |
| scripting | Run, only at that moment, the scripts that extract text, pick an area, or fill a prompt into an AI site |
| storage | Save settings |
| unlimitedStorage | Keep saving when items and images grow |
| sidePanel | Show the list in the side panel |
| contextMenus (optional) | Only if you turn it on, add “Save to ScrapAI” to the right-click menu |
| chatgpt.com / claude.ai / gemini.google.com (optional) | Requested the first time you use one-click handoff. Only in the tab ScrapAI opened, it fills in the prompt and reads the answer when you click “Save to ScrapAI” |

ScrapAI does not request access to all websites.
