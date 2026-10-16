# プライバシーポリシー / Privacy Policy

## 日本語

ScrapAI は、あなたが保存したページの情報を **お使いのブラウザの中（IndexedDB）にだけ** 保存します。

- **外部への送信はありません。** 開発者のサーバーも、第三者のサービスも使いません。アクセス解析・広告・トラッキングもありません。
- **AIのAPIは呼びません。** AIに渡すときは、プロンプトをあなたがコピーして各AIサービスの画面に貼ります。その先の扱いは各サービスの規約に従います。
- **Chromeの同期（Chrome Sync）は使いません。** データは他の端末へは送られません。他の端末へ移すときは、エクスポート/インポート（JSONファイル）を使います。
- **保存するのは、ボタンやショートカット、右クリックメニューで保存を実行したページだけです。** 閲覧履歴を自動で集めることはありません。
- 保存する内容：ページのURL・タイトル、抽出した本文、あなたのメモ・星・カテゴリ、貼り付けたAIの回答、サイト設定、テンプレート、表示設定。
- データの削除：拡張機能の画面から項目を削除できます。拡張機能を削除すると、保存したデータも消えます（先にエクスポートしてください）。

### 権限の用途
| 権限 | 用途 |
|---|---|
| activeTab | 保存を実行した（アイコンのクリック、ショートカット、右クリック）現在のタブの内容を読む |
| scripting | その時点でだけ、ページから本文を取り出すスクリプトを実行する |
| storage | 設定を保存する |
| unlimitedStorage | 保存したスクラップが多くなっても保存できるようにする |
| sidePanel | サイドパネルで一覧を表示する |
| contextMenus（任意） | 設定でオンにしたときだけ、右クリックメニューに「ScrapAIに保存」を出す |

サイトへのアクセス権限（host_permissions）は要求しません。

## English

ScrapAI stores the pages you save **only inside your browser (IndexedDB)**.

- **Nothing is sent anywhere.** No developer server, no third-party service, no analytics, ads or tracking.
- **No AI API is called.** To use an AI, you copy the generated prompt and paste it into the AI service yourself; what happens next is governed by that service’s terms.
- **Chrome Sync is not used.** Data does not move to other devices. To move it, use Export/Import (a JSON file).
- **Only pages you explicitly save are stored** (button, keyboard shortcut or context menu). Browsing history is never collected automatically.
- Stored: page URL and title, extracted text, your notes, stars and categories, pasted AI answers, site settings, templates, display settings.
- Deletion: delete items from the extension’s screens. Uninstalling the extension deletes all saved data (export first).

### Permissions
| Permission | Purpose |
|---|---|
| activeTab | Read the current tab only at the moment you save (icon click, shortcut, context menu) |
| scripting | Run the text-extraction script on that page only at that moment |
| storage | Save settings |
| unlimitedStorage | Keep saving when the library grows large |
| sidePanel | Show the list in the side panel |
| contextMenus (optional) | Only if you turn it on in settings, add “Save to ScrapAI” to the right-click menu |

No host permissions are requested.
