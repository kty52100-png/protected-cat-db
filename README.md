# 保護猫DB PWA v2

Android / iPhone / PCのブラウザで利用する保護猫データベースの初期PWAです。

## 現在できること

- Supabase Authログイン
- 猫一覧・検索・状態フィルター
- 猫の新規登録
- 猫情報の編集
- 管理番号の自動採番（DB側）
- 観察日記の登録
- ワクチン / FIV / FeLV / 手術履歴の表示
- 譲渡・死亡情報の表示
- RLSによる権限制御を利用
- A4印刷 / ブラウザの「PDFに保存」
- PWAとしてホーム画面へ追加
- Google Drive連携用のDB構造に対応

## まだ次フェーズで追加するもの

- Google Drive OAuthログイン
- 猫ごとのDriveフォルダ自動作成
- スマホから写真撮影・Driveアップロード
- 写真を代表写真として設定
- 保健所提出用の正式帳票レイアウト
- 複数猫をまとめたPDF
- ワクチン / 検査 / 手術の入力画面
- 譲渡情報入力画面
- 管理者によるスタッフ招待・権限変更
- オフライン入力キュー（現在はUIシェルのみオフライン対応）

## 1. Supabase

先に `protected_cat_db_v1.sql` をSupabase SQL Editorで実行してください。
その後、必要なら `protected_cat_sample_nemo.sql` を実行してください。

## 2. 最初の管理者

Supabase Dashboard > Authentication > Users で最初のユーザーを作成します。

そのUUIDを使ってSQL Editorで:

```sql
update public.profiles
set role = 'admin',
    display_name = '管理者'
where id = 'ユーザーUUID';
```

スタッフは:

```sql
update public.profiles
set role = 'staff',
    display_name = 'スタッフ名'
where id = 'ユーザーUUID';
```

## 3. PWA設定

`config.js` に以下を入れます。

```js
window.CAT_DB_CONFIG = {
  supabaseUrl: "https://xxxxx.supabase.co",
  supabaseAnonKey: "YOUR_ANON_PUBLIC_KEY"
};
```

**Service Role Keyは絶対に入れないでください。**

このPWAではブラウザにSupabase anon keyが存在する前提です。
セキュリティはSupabaseのRLSが担当します。

## 4. ローカルテスト

HTTPSまたはlocalhostで動かす必要があります。

例:

```bash
python -m http.server 8080
```

ブラウザで:

http://localhost:8080/

## 5. 無料公開

GitHub Pagesなどの静的ホスティングへこのフォルダを配置できます。

公開後のURL例:

https://ユーザー名.github.io/protected-cat-pwa/

Supabase AuthenticationのURL設定にも公開URLを登録してください。

## 6. Google Drive

Google Driveの実ファイルはSupabaseに保存しません。
`cat_files` にDrive file ID等を保存します。

次フェーズではGoogle Identity Services + Google Drive APIを使って、
スマホから写真をDriveへアップロードし、`cat_files`へ登録する流れを実装します。

## 7. PDF

現在の `PDF / 印刷` ボタンはA4印刷CSSを使います。
Chrome/Safariの印刷画面で「PDFに保存」を選べます。

保健所提出用の帳票は、サンプル画像のレイアウトに合わせて次フェーズで専用テンプレート化します。


# v2: Google Drive + 保健所提出用PDF

## Google Drive設定

1. Google Cloud Consoleでプロジェクトを作成。
2. Google Drive APIを有効化。
3. OAuth 2.0 Client ID（ウェブアプリケーション）を作成。
4. 「承認済みのJavaScript生成元」に、PWAを公開するHTTPS URLを登録。
5. `config.js` の `googleClientId` にClient IDを設定。
6. PWAへログイン後、「Google Drive接続」を押す。
7. 猫詳細で「写真を追加」からスマホのカメラ/写真を選択。

v2では `drive.file` スコープだけを使い、アプリが作成したDriveファイル/フォルダに限定して操作します。

猫ごとに、

`KS-H018_ネモ`

のようなフォルダを作り、その中へ写真を保存します。
Supabase `cat_files` にはDriveのファイルID・フォルダID・閲覧URLを保存します。

## 保健所提出PDF

猫詳細の「保健所PDF / 印刷」で、サンプル画像を参考にしたA4帳票を生成します。

ブラウザの印刷画面で、

- Windows Chrome: 「送信先 → PDFに保存」
- iPhone/iPad: 印刷プレビューから共有/保存
- Android Chrome: 「共有/印刷 → PDFとして保存」

を選択してください。

実際の自治体指定様式と完全一致させる必要がある場合は、自治体から配布された最新様式を確認して最終調整してください。

## セキュリティ

- ブラウザにSupabase anon keyを置くこと自体は想定しています。
- Supabase RLSがDBのアクセス制御を行います。
- `service_role` key、Google Client Secret、秘密鍵はPWAへ絶対に入れません。
- Google Driveの個人情報・譲渡書類は、権限設定を確認して運用してください。

## v4修正
Google Driveのmultipart upload endpointを修正しました。v3で写真アップロード時に「failed to fetch」になる問題に対応しています。
