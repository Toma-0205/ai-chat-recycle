📘 Gemini to Notion Knowledge Archiver
Google Gemini での会話スレッド全体を AI が賢く要約し、Notion データベースへ自動保存する Chrome 拡張機能です。

✨ 主な機能
- **スレッド一括保存**: 単一の回答だけでなく、スレッド内の全やり取りを保存します。
- **AI 自動要約**: Gemini API を利用して、会話のタイトル、3 行要約、議事録を自動生成します。
- **TODO 抽出**: 会話の中から「次にやるべきこと（TODO）」や「完了したこと（DIDs）」を自動で抜き出します。
- **Notion 連携**: 構造化されたデータを Notion の各プロパティ（列）へ直接流し込みます。
- **コンテキストの継続性**: DBに会話内容を保存することで、新しいチャットでその内容をインプットに会話ができます。

🛠️ セットアップ・ガイド

### ステップ1：Notion データベースの準備

保存先となるテーブルを用意します。

1. **Notion Integrations** でインテグレーションを作成する
2. 発行された **Internal Integration Token** をコピーする（Show → Copy）
3. 拡張の設定画面の **Internal Integration Token** に貼り付けて保存する
4. Notion側のインテグレーション設定画面を下までスクロールして **Save** する
5. Notionを開き、左サイドバーの **Private** をホバーして `+`（Add a page）をクリックする
6. 新しいページ名を設定する（例：`Gemini Knowledge`）
7. 画面下部の **Database** をクリックし、**Empty Database** を選択する
8. 右上の `...`（三点リーダー）をクリックする
9. 少し下にスクロールして **Connections** をクリックする
10. 作成したインテグレーションを選んで **Confirm** をクリックする
11. データベースのURLから **Database ID** をコピーして、拡張の **Database ID** に入力する  
    - 例：`notion.so/a8b...123?...`  
    - 取り出す範囲：`notion.so/` の後ろから `?` の前まで

### ステップ2：拡張機能のインストールと設定
1. ブラウザの chrome://extensions/ を開き、「パッケージ化されていない拡張機能を読み込む」から本フォルダを選択します。
2. 拡張機能のオプション画面を開き、取得した 3 つのキー（Notion API Key, Database ID, Gemini API Key） を入力して保存します。
3. 対象チャットは **基本は Auto（推奨）** でOK。必要なときだけ「詳細設定」から手動/無効に切り替えできます。

### ステップ3：利用開始
1. Google Gemini で会話を行います。
2. 回答ブロックの下に表示される 「Notion へ保存」 ボタンをクリックします。
3. 「Notion に保存完了」という通知が出れば成功です！

---

## 開発者向けガイド

### これは何？
- Geminiの会話をNotionに保存するChrome拡張。
- ChatGPTなども後から足せるように、AIごとの処理を分けてある。

### どこで動くか（MV3の役割）
- `content.js`：ページ内で動く。ボタン表示、会話の抽出、入力欄への貼り付け、プレビュー表示など。
- `background.js`：拡張の裏側で動く。Notion APIと通信して保存/検索/取得をする。
- `options.*`：設定画面。Notion API Key / Database ID / モード（auto・手動・off）を保存する。
- `popup.*`：設定できているかの簡易チェック。

### どこに何を書くか（フォルダのルール）
- `ai_clients/`：AIごとの違いを書く（DOM抽出・注入など）
  - `gemini/`：Gemini用の実装
  - `chatgpt/`：今は注入確認用ボタンだけ（本実装はこれから）
- `shared/`：どのAIでも共通で使う処理
  - `flows/`：保存の流れ（プロンプト生成→JSON抽出→プレビュー→Notion保存）
  - `json/`：JSON抽出（ここだけテストしてる）
  - `config/`：設定保存まわり（activeClientIdなど）
  - `ui/`：トースト、プレビューなどのUI

### 主な流れ
- まとめ作成：会話を取り出す → JSONで返すようにプロンプト作る → 入力欄に入れる  
- 保存：JSONを抜き出す → プレビューで確認 → Notionに保存（Notion通信はbackground）

### Autoモード
- `activeClientId = auto` なら、開いてるURLでGemini/ChatGPTを自動で選ぶ。
- 対応してないページでは何もしない（トーストで知らせる）。

### トースト（状態表示）
- いま有効になっているAIを表示する  
  - 例：`gemini` / `chatgpt`（Autoでも最終的に選ばれた方を出す）
- 設定と開いてるページがズレているとき  
  - 例：`対象外（設定: gemini / ページ: chatgpt）`
- そもそも未対応のサイトのとき  
  - 例：`未対応のページ（<host>）`

### 新しいAIを追加する手順
1. `ai_clients/<name>/client.js` を作る（新しいAI用のファイル）
2. そのAIだと判定する関数と、DOM操作を実装する  
   - `matches(url)`（このAIのページか？）  
   - `extractThread` / `extractResponseText` / `extractPromptText` / `injectPrompt`
3. `ai_clients/registry.js` から使えるように登録する  
   - `global.ArchiverClients[CLIENT_ID] = ...`
4. `manifest.json` に対応URLと読み込みファイルを追加する  
   - `content_scripts.matches` にURLを追加  
   - `content_scripts.js` に `ai_clients/<name>/client.js` を追加（**registry.js より前**）
5. 手動切替に出したいなら `options.html` の選択肢（activeClientId）にも追加する

### テスト
- `npm test`
- 対象は `shared/json/extract.js` だけ  
  DOMに依存しない部分だけ自動テストで固めるため。

### ChatGPTの対応状況
- いまは「ページに注入できてるか確認する」段階（確認用ボタンのみ）。
- DOM抽出・入力欄注入・保存フローはこれから。
