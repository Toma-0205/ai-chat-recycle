📘 Gemini to Notion Knowledge Archiver
Google Gemini での会話スレッド全体を AI が賢く要約し、Notion データベースへ自動保存する Chrome 拡張機能です。

✨ 主な機能
- **スレッド一括保存**: 単一の回答だけでなく、スレッド内の全やり取りを保存します。
- **AI 自動要約**: Gemini API を利用して、会話のタイトル、3 行要約、議事録を自動生成します。
- **TODO 抽出**: 会話の中から「次にやるべきこと（TODO）」や「完了したこと（DIDs）」を自動で抜き出します。
- **Notion 連携**: 構造化されたデータを Notion の各プロパティ（列）へ直接流し込みます。
- **コンテキストの継続性**: DBに会話内容を保存することで、新しいチャットでその内容をインプットに会話ができます。

🛠️ セットアップ・ガイド（5ステップ）

### ステップ1：Notion データベースの準備
保存先となるテーブルを用意します。

1. Notion で新規ページを作成し、「テーブル」データベースを追加します。
2. 以下のプロパティ（列）を正確な名前で作成してください：
    - **名前 (タイトル型)**: 会話のタイトルが入ります。
    - **回答 (テキスト型)**: 詳細な議事録（Markdown 形式）が入ります。
    - **概要 (テキスト型)**: 3 行要約が入ります。
    - **やること (テキスト型 または マルチセレクト型)**: TODO や実績が入ります。
    - **時期 (日付型)**: 保存日が入ります。

### ステップ2：Notion API キーと ID の取得
1. Notion My Integrations で「新しいインテグレーション」を作成し、Internal Integration Token をメモします。
2. 作成したデータベースの「…」メニュー内「接続先を追加」から、今作ったインテグレーションを許可します。
3. データベースの URL から、notion.so/ の直後にある 32 文字の英数字（Database ID） をコピーします。

### ステップ3：Google Gemini API キーの取得
1. Google AI Studio にアクセスします。
2. 「Create API key in new project」を選択して、API キー（AIza...）を発行・保存します。
   ※無料枠で利用可能です。

### ステップ4：拡張機能のインストールと設定
1. ブラウザの chrome://extensions/ を開き、「パッケージ化されていない拡張機能を読み込む」から本フォルダを選択します。
2. 拡張機能のオプション画面を開き、取得した 3 つのキー（Notion API Key, Database ID, Gemini API Key） を入力して保存します。
3. 対象チャットは **基本は Auto（推奨）** でOK。必要なときだけ「詳細設定」から手動/無効に切り替えできます。

### ステップ5：利用開始
1. Google Gemini で会話を行います。
2. 回答ブロックの下に表示される 「Notion へ保存」 ボタンをクリックします。
3. 「Notion に保存完了」という通知が出れば成功です！

---

## 開発者向けガイド

### 目的 / 全体像
- Gemini の会話を Notion に保存する拡張機能です。
- 将来的に ChatGPT などの他チャットを `ai_clients/` で追加できるよう構成しています。

### MV3 の構成（役割）
- `content.js`: 入口/配線（クライアント選択・ミスマッチ検知・初期化）。
- 主要ロジックは `ai_clients/` と `shared/` に集約。
- `background.js`: Notion API 通信（保存/検索/取得）。
- `options.*`: API Key / Database ID / アクティブクライアントの設定。
- `popup.*`: 設定状態の確認 UI。

### ディレクトリ構成（重要）
- `ai_clients/`: チャット種別ごとの差分（DOM 抽出・注入）
  - `ai_clients/gemini/`: Gemini 実装
  - `ai_clients/chatgpt/`: ChatGPT スタブ（注入確認のみ）
- `shared/`: 共通ロジック
  - `shared/flows/`: まとめ作成・保存フロー
  - `shared/json/`: JSON 抽出（テスト対象）
  - `shared/config/`: ストレージ設定（activeClientId）
- `shared/ui/`: 共通UI（トースト/プレビュー/インジケータ）

### 主要フロー（概要）
- まとめ作成 → 会話抽出 → JSON 出力プロンプト生成 → 入力欄へ貼付
- JSON 抽出 → プレビュー → Notion 保存

### Autoモード
- `activeClientId = auto` の場合は URL から client を自動選択します。
- 未対応ページでは「unsupported」を表示して何もしません。

### 動作確認トースト
- 状態はトーストで表示します。
- 例: `Archiver: auto→chatgpt`, `Archiver: mismatch (active=gemini, page=chatgpt)`, `Archiver: unsupported (<host>)`

### 新しい AI チャットを追加する手順
1. `ai_clients/<name>/client.js` を作成
2. `matches(url)` と DOM 抽出 / 注入を実装
3. `manifest.json` の `content_scripts.matches` に対象URLを追加
4. `options.html` のクライアント選択に追加（手動切替対応）

### テスト
- 実行方法: `npm test`
- 対象: `shared/json/extract.js` のみ
- 理由: DOM に依存しない純粋関数を最小の自動テストで保証するため

### ChatGPT 対応状況
- 現状は **スタブ** です（注入確認・手動切替の動作確認のみ）。
- DOM 抽出 / 入力欄注入 / 保存フローは TODO。
