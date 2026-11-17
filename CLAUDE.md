# プロジェクトのルール

## 技術スタック

- UIは **React** を使用する
- ビルドツール・テストツールは、導入前にユーザーへ確認する
  （候補: Vite + Vitest + React Testing Library）

## 開発の進め方

### テスト駆動開発（TDD）

1. 先に失敗するテストを書く（Red）
2. テストが通る最小限の実装をする（Green）
3. テストが通ったまま整理する（Refactor）

- テストを書く前に、実装コードを書かない
- 「できた」と言う前に、テストを実際に動かして結果を見せる

### 実装前にドキュメントを確認する

- 実装を始める前に、使うライブラリ・APIの**最新の公式ドキュメント**を参照する
- 記憶だけで書かない。バージョンによる違いに注意する
- 参照したドキュメントの要点を、実装前に短く伝える

## フォルダ構成

```
Section5_handson_1/
├── CLAUDE.md          # このファイル
├── .scratchpad/       # 一時ファイル置き場（Git管理しない）
├── .gitignore
├── package.json
├── public/            # 静的ファイル
└── src/
    ├── main.jsx       # エントリーポイント
    ├── App.jsx        # ルートコンポーネント
    ├── components/    # 再利用するUIコンポーネント
    ├── hooks/         # カスタムフック
    ├── repositories/  # 保存層（local/ = IndexedDB実装、supabase/ = Supabase実装、types.js = 契約）
    ├── workers/       # Web Worker（csvParse.worker.js など）
    └── utils/         # 共通関数（分析ロジックの純粋関数）
tests/                 # テスト（src と同じ階層で *.test.jsx / *.test.js）。テスト用の偽物（LocalAuth など）も置く
docs/                  # 要件・設計・計画・設定手順（06 = Supabase 認証の設定）
.env.example           # 接続設定の見本（.env は Git 管理外）
```

- 構成を変えるときは、このファイルも更新する

## 一時ファイル

- メモ・ログ・試し書きは、プロジェクト直下の `.scratchpad/` に置く
- フォルダがなければ作成する
- 不要になったらすぐ削除する。作業の終わりには `.scratchpad/` を空にする
- `.scratchpad/` は `.gitignore` に入れる

## Git

- Gitで管理する（未初期化なら、最初にユーザーへ確認して `git init` する）
- **区切りごとに、コミットするかユーザーに聞く**（勝手にコミットしない）
  - 区切りの例: 機能が1つ動いた、テストが通った、リファクタが終わった
- `main` に直接pushしない。ブランチを作り、PRにする
- コミットメッセージは日本語で簡潔に書く
