# Speak in 3 — 英会話タイムアタック

テーマ入力（音声フリートーク対応）→ 単語・例文 → 四択テスト → 3秒返答の会話タイムアタック → AIふりかえり、という流れの英会話初級者向けトレーニングアプリ。**会員登録制**（メールアドレス＋仮パスワード）で、過去の記録は本人のみ閲覧・編集・削除できる。

構成: **GitHub Pages（フロント）+ Google Apps Script（バックエンド）+ Gemini API（生成AI）+ Google スプレッドシート（会員・ログ保存）+ Google ドライブ（会話ログ保存）**

## セットアップ手順

### 1. Google Apps Script プロジェクトを作る
1. https://script.google.com で新規プロジェクトを作成
2. `Code.gs` の中身を貼り付け
3. 「プロジェクトの設定」→「スクリプト プロパティ」に以下を追加
   - `GEMINI_API_KEY` … Google AI Studio で発行したGeminiのAPIキー
   - `SHEET_ID` … 会員・ログ保存用スプレッドシートのID（新規スプレッドシートを作りURLから取得。`members`シートと`logs`シートは初回実行時に自動作成される）
   - `DRIVE_FOLDER_ID` … 会話ログ（テキストファイル）を保存するGoogleドライブのフォルダID
   - `PEPPER` … パスワードハッシュ化用の任意の固定文字列（長めのランダム文字列を設定推奨。未設定でも動くが、設定した方が安全）
4. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」
   - 実行ユーザー: 自分
   - アクセスできるユーザー: 全員
5. 発行された `https://script.google.com/macros/s/.../exec` をコピー
6. 初回、会員登録や再発行を試すと「承認が必要です」と出るので、Gmail送信（GmailApp/MailApp）の権限を許可する
7. 会員登録・パスワード再発行メールは `my60smyrules@gmail.com` を送信元として送られる（`Code.gs`内`SENDER_EMAIL`）。この送信元を実際に使うには、GASを実行しているGoogleアカウントのGmail設定で `my60smyrules@gmail.com` を「送信元アドレス（送信エイリアス）」として追加・確認済みにしておく必要がある（Gmail設定 → アカウントとインポート → 「名前」欄 → 他のメールアドレスを追加）。未確認の場合は自動的にスクリプト実行アカウント自身のアドレスからの送信にフォールバックする

> コードを修正した後は、同じURLのまま更新したい場合「デプロイの管理」→ 編集（鉛筆アイコン）→ バージョン「新バージョン」を選んで再デプロイしてください。新規デプロイを作るとURLが変わります。

### 2. フロントエンドにURLを設定
`script.js` の1行目付近

```js
const GAS_URL = "https://script.google.com/macros/s/【あなたのデプロイID】/exec";
```

を、手順1で発行されたURLに書き換える。

### 3. GitHub Pages に公開
1. 新しいリポジトリ（例: `eikaiwa-time-attack`）を作成
2. `index.html`, `style.css`, `script.js` をリポジトリ直下にpush
3. リポジトリの Settings → Pages → Branch を `main` / `root` に設定
4. `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される

### 4. 動作確認時の注意
- 音声認識（Web Speech API）は **Chrome系ブラウザ推奨**。Safariでは非対応の場合あり。
- 初回アクセス時にマイク使用の許可が必要。
- スマホ実機で使う場合、GitHub Pagesは自動でhttpsなので問題なし（Web Speech APIはhttps必須）。
- ログインセッションはブラウザの`localStorage`に保存され、有効期限は6時間（`Code.gs`の`SESSION_TTL_SEC`で変更可）。

## ファイル構成
```
index.html   … 画面構造（認証画面＋テーマ入力/学習/テスト/会話/ふりかえりの5画面）
style.css    … デザイン（ネイビー×コーラルのタイムアタック配色）
script.js    … 認証・画面遷移・音声認識・タイマー・GAS通信
Code.gs      … 会員認証・Gemini API連携・ログのスプレッドシート＆Drive保存
```

## 会員機能
| 機能 | 内容 |
|---|---|
| 新規登録 | ニックネーム＋メールアドレスを登録すると、仮パスワードがメールで届く |
| ログイン | 仮パスワードでログインすると、初回のみ強制的にパスワード変更画面が出る |
| パスワードを忘れた場合 | メールアドレスを入力すると仮パスワードを再発行してメール送信 |
| パスワード表示/非表示 | ログイン・登録・パスワード変更の各入力欄に切り替えボタンあり |
| ニックネーム変更／パスワード変更 | ログイン後、右上のアカウントメニューから可能 |
| 過去の記録 | 本人のログイン中のみ一覧表示。各記録を「もう一度話す」「評価を見る」「編集（テーマ名）」「削除」可能。他人の記録にはアクセス不可 |

## 主な機能と実装場所
| 要件 | 実装 |
|---|---|
| 会員登録・仮パスワード発行・強制パスワード変更・再発行 | `registerMember` / `loginMember` / `changePassword` / `forgotPassword`（Code.gs） |
| テーマ入力（音声フリートーク）→単語・例文・四択自動生成 | `generateStudySetFromTranscript` / `generateStudySet`（Code.gs） |
| 音声での英会話 | Web Speech API（script.js: SpeechRecognition / speechSynthesis） |
| 3秒（可変）以内の返答タイムアタック | `beginListenWindow`（script.js のカウントダウンリング、待ち時間はセレクトで変更可） |
| 会話の評価・改善案 | `evaluateConversation`（Code.gs） |
| 記録の保存・一覧・再利用・編集・削除（本人限定） | `saveLog` / `listSessions` / `loadSession` / `updateSessionTheme` / `deleteSession`（Code.gs、すべてsessionTokenで本人確認） |

