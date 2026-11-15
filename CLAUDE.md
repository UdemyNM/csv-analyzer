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
├── vite.config.js     # Vite + Vitest設定
├── index.html
├── docs/              # 仕様書（テストの元になる）
├── tests/             # テスト（src と同じ階層、対象と同じ名前で *.test.jsx）
│   ├── helpers/       #   テスト用の補助（samples の読込・Rechartsのモック・独立な期待値計算など）
│   └── setup.js       #   jest-dom の登録
├── .claude/agents/    # サブエージェント定義
├── public/            # 静的ファイル
├── samples/           # テスト用サンプルCSV（README.md に確かめ方）
├── supabase/          # migrations・RLS（Phase 8。未作成）
└── src/
    ├── main.jsx       # エントリーポイント
    ├── App.jsx        # ルートコンポーネント（HashRouter・ルート定義）
    ├── index.css      # 全体のスタイル
    ├── components/    # 再利用するUIコンポーネント
    │   ├── AppHeader.jsx
    │   ├── auth/      #   LoginForm
    │   ├── datasets/  #   UploadForm / DatasetList / DatasetDetail（詳細画面）/ DatasetHeader / VisibilityBadge / VisibilityToggle
    │   ├── analysis/  #   FilterBar / AnalysisTabs / DataTable / AggregatePanel / StatsPanel / CorrelationMatrix
    │   ├── charts/    #   ChartBuilder / ChartView
    │   └── views/     #   SavedViewList / SaveViewDialog
    ├── hooks/         # カスタムフック（useAuth / useDatasets / useCsvAnalysis）
    ├── repositories/  # 保存層（types.js = 契約、local/ = IndexedDB実装。supabase/ は Phase 8）
    ├── workers/       # Web Worker（CSVパース）
    └── utils/         # 共通関数（純粋関数）
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
