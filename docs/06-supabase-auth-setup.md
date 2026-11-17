# 06. Supabase 認証の設定手順（Phase 8a）

アプリのログインは Supabase Auth（メール＋パスワード）で行う。
**アプリにはサインアップ画面も擬似ユーザーも無い。ユーザーは管理者が Supabase のダッシュボードで発行する。**

> ダッシュボードの画面名・場所は 2026-11 時点の公式ドキュメントに基づく。変わっていたら最新の公式ドキュメントで確認する。

## 1. プロジェクトを作る

1. https://supabase.com/dashboard で新しいプロジェクトを作る（無料プラン）
2. リージョンは利用者に近い場所（例: Tokyo）を選ぶ

## 2. 新規登録（サインアップ）を止める

- Authentication の設定で **「Allow new users to sign up」をオフ**にする
  - オフにすると、既にいるユーザーだけがログインできる（公式: General configuration）
- 確認（必須）: publishable キーで登録 API を呼び、**拒否される**ことを確かめる

```bash
curl -s -X POST "https://<project-ref>.supabase.co/auth/v1/signup" -H "apikey: <publishable key>" -H "Content-Type: application/json" -d '{"email":"test-signup@example.com","password":"long-random-password"}'
```

- 期待する結果: エラー（サインアップが許可されていない旨）。ユーザーが作られていたら設定を見直し、そのユーザーを削除する

## 3. ユーザーを発行する（管理者）

1. Authentication → Users →「Add user」→「Create new user」
2. メールアドレスと初期パスワードを入れる。メール確認を使わないので「Auto Confirm User」にチェックする
3. 初期パスワードは安全な方法で本人に渡す（チャットやメールに平文で残さない）
4. 表示名（任意）: アプリは `app_metadata.display_name` を表示名に使う。無ければメールアドレスを表示する。
   SQL Editor で設定する例:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"display_name": "山田"}'::jsonb
where email = 'yamada@example.com';
```

- **`user_metadata`（`raw_user_meta_data`）には入れない。** 本人がアプリの外から書き換えられるため、他人の名前を名乗れてしまう（2026-11 のセキュリティレビューで修正）
- 設定すると、作成者名（`profiles`）にはすぐ反映される。本人のヘッダーの表示名は、次にログインしたとき（またはセッションの自動更新後）に変わる

- パスワードの再設定も管理者が行う（アプリに再設定画面は無い。docs/01 OQ-1）
- 退職などで使わなくなったユーザーは、Authentication → Users から削除する

## 4. アプリに接続設定を入れる（開発環境）

1. Project Settings → API Keys で、**publishable キー**（従来の anon キー）をコピーする
2. プロジェクト直下に `.env` を作る（`.env.example` をコピー。`.env` は Git 管理外）

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

- **secret キー（`sb_secret_…`）・service_role キーは絶対に入れない。** `VITE_` で始まる値はビルド結果（公開されるファイル）に入る。
  アプリは秘密のキーを検出すると起動を止め、設定エラーを表示する
- 設定が無い・不正なときも、アプリは設定エラーを表示する（擬似ユーザーなどへは切り替わらない）

## 5. GitHub Pages（本番）に接続設定を入れる

- GitHub のリポジトリ → Settings → Secrets and variables → Actions → **Variables** に次の 2 つを登録する
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
- `deploy.yml` のビルドがこの値を使う。**登録する前にデプロイすると、公開サイトは設定エラーの画面になる**
- Authentication → URL Configuration の Site URL に、公開 URL（GitHub Pages）を入れておく
  （メール＋パスワードのログインでは使わないが、今後の招待・再設定メールの戻り先になる）

## 6. 動作確認

1. `npm run dev` で開き、発行したユーザーでログインできる
2. 間違ったパスワード・未登録のメールでは「メールアドレスまたはパスワードが違います」になる
3. ログアウトすると /login に戻る。再読み込みしてもログイン状態が保たれる
4. 手順 2 の確認（サインアップが拒否される）を済ませている

## 次の手順

- データ・CSV 原本の共有（Phase 8b）の設定は `docs/07-supabase-sharing-setup.md`
- 表示名（手順 3 の 4）を変えると、作成者名の表示（`profiles` テーブル）にも自動で反映される
