# 02. 構成（システム・フォルダ）

## 1. 設計方針

1. **分析はブラウザ内で実行**（〜10MB・〜10人なら十分。サーバー費用ゼロ、無料枠に収まる）
2. **保存層を抽象化**（Repository）。第1段階はローカル実装、最終段階でSupabase実装に差し替え
3. 分析ロジックは**UIから独立した純粋関数**（TDDしやすい）
4. 権限はDB側（RLS）で強制

## 2. システム構成

### 2.1 第1段階: ローカル

```
┌────────────────────── ブラウザ ──────────────────────┐
│  React UI                                            │
│   ├─ hooks (useDatasets / useAnalysis ...)           │
│   ├─ utils (csv読込 / 集計 / 統計 / 相関)  ← Worker  │
│   └─ repositories  ──►  LocalRepository (IndexedDB)  │
│                          LocalAuth（擬似ユーザー切替）│
└──────────────────────────────────────────────────────┘
        ▲ Vite 開発サーバー（静的配信のみ）
```

- 複数ユーザー共有は、擬似ユーザー切替で権限ロジックを確認（実際の共有は第2段階）
- （Phase 8a で変更）擬似ユーザー切替は削除した。認証は Supabase Auth（ユーザーは管理者が発行）。テスト用の LocalAuth は `tests/repositories/local/` に置く
- （Phase 8b で変更）データ・ファイルも Supabase へ移した（2.2 が現在の構成）。IndexedDB 実装はテスト用として `tests/repositories/local/` に置く

### 2.2 第2段階（最終）: Supabase 無料プラン

```
┌──────── ブラウザ ────────┐        ┌────────── Supabase ──────────┐
│ React UI                 │        │ Auth（メール+パスワード）     │
│  utils(分析) ← Worker    │ HTTPS  │ Postgres                     │
│  SupabaseRepository  ────┼───────►│  profiles/datasets/views+RLS │
│                          │        │ Storage（private バケット）   │
└──────────────────────────┘        │  csv原本 {owner}/{id}.csv     │
        ▲ GitHub Pages（静的）        └──────────────────────────────┘
        （Vercel/Netlify/GitHub Pages等。選定は実装計画で確認）
```

### 2.3 データフロー（アップロード→閲覧）

1. 一覧画面のドロップ枠にCSVをドロップ（または「ファイルを選ぶ」）→ サイズ/拡張子検証
2. 文字コード判定（UTF-8として厳密デコード、失敗したらShift_JIS）
3. CSVパース（Worker）→ 列の型推定 → 列情報とプレビューを生成
4. 保存: 原本をStorage（ローカル時はIndexedDB）、メタ情報をdatasetsへ
   4b. 保存できたら、そのデータセットの分析画面（`/datasets/:id`）を開く（名前はファイル名）
5. 閲覧: 一覧取得（RLSで自分＋全員公開のみ）→ 原本取得 → ブラウザ内でパース・分析
6. ビュー保存: 設定JSONをviewsへ

### 2.4 技術スタック（案）

| 領域               | 案                                                                           | 備考                                            |
| ------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| 言語               | JavaScript（型はJSDocで補う）                                                | 確定                                            |
| UI                 | React                                                                        | 確定                                            |
| ホスティング       | GitHub Pages                                                                 | 確定。Viteの`base`とSPAルーティングに注意       |
| ビルド/開発        | Vite                                                                         | **導入前に要確認**                              |
| テスト             | Vitest + React Testing Library                                               | **導入前に要確認**                              |
| CSVパース          | PapaParse                                                                    | 追加時に要確認                                  |
| グラフ             | Recharts                                                                     | 追加時に要確認                                  |
| ドラッグ＆ドロップ | @dnd-kit/react（0.5 系。マウス・タッチ・キーボード対応）                     | 2026-11-16 追加（ユーザー承認済み）             |
| 統計               | 自前の純粋関数（平均/中央値/標準偏差/相関）。必要なら simple-statistics      | 追加時に要確認                                  |
| ルーティング       | React Router（GitHub Pagesでは `HashRouter` が有力。最新ドキュメントで確認） | 追加時に要確認                                  |
| 認証/DB/Storage    | Supabase（@supabase/supabase-js）                                            | 第2段階。最新公式ドキュメントを確認してから実装 |

## 3. データモデル（Supabase 想定）

```
profiles   : id(uuid, = auth.users.id) / display_name / created_at   ※auth.users のトリガーで自動作成・更新
             display_name は app_metadata.display_name（管理者だけが設定）。無ければ空。メールアドレスは入れない
datasets   : id / owner_id→profiles(既定値 auth.uid()) / name / visibility('private'|'shared')
             / meta(jsonb: 行数・文字コード・列情報など。Repository の meta をそのまま)
             / file_size / storage_path(生成列 = owner_id/id.csv) / created_at / updated_at
views      : id / dataset_id→datasets(on delete cascade) / owner_id(既定値 auth.uid())
             / name / config(jsonb) / created_at / updated_at
```

定義の正本は `supabase/migrations/`。書き換えられる列は GRANT で絞る（datasets は name / visibility、views は name / config）。

`views.config` の例:

```json
{
  "filters": [
    { "column": "region", "op": "in", "values": ["東京", "大阪"] },
    { "column": "sales", "op": "gte", "value": "1000" }
  ],
  "sort": { "column": "sales", "direction": "desc" },
  "hiddenRows": [3, 17],
  "hiddenColumns": ["memo"],
  "pivot": {
    "rows": ["region"],
    "columns": ["product"],
    "values": [{ "column": "sales", "fn": "sum" }]
  },
  "chart": { "type": "bar", "scatter": { "x": "quantity", "y": "sales" } }
}
```

### RLS方針

| テーブル     | SELECT                                        | INSERT                                 | UPDATE/DELETE                                        |
| ------------ | --------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| datasets     | owner本人 または visibility='shared'          | owner_id = 自分                        | owner本人のみ                                        |
| views        | 親datasetが閲覧可能                           | 親datasetが閲覧可能 かつ owner_id=自分 | owner本人のみ                                        |
| Storage(csv) | 自分のフォルダ配下 または 親datasetが閲覧可能 | 自分のフォルダ配下のみ                 | 自分のフォルダ配下のみ（DELETEのみ。上書きはしない） |
| profiles     | ログイン中なら全員                            | なし（トリガーのみ）                   | なし                                                 |

- anon（未ログイン）には、どのテーブルにも GRANT しない

## 4. フォルダ構成

```
Section5_handson_1/
├── CLAUDE.md
├── .scratchpad/                # 一時ファイル（Git管理しない）
├── .gitignore
├── package.json
├── docs/
│   ├── 01-requirements.md
│   ├── 02-architecture.md
│   ├── 03-functional-design.md
│   └── 04-implementation-plan.md
├── tests/                      # 対象と同名の *.test.jsx（src と同じ階層構造）
├── public/
├── supabase/                   # 第2段階: migrations（テーブル/RLS）
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── components/             # UI部品
    │   ├── auth/ (LoginForm)
    │   ├── datasets/ (DropZone, UploadNotice, DatasetList, VisibilityToggle)   ※UploadForm から変更予定
    │   ├── analysis/ (FilterBar, CollapsibleSection, HelpButton, DataTable, AggregatePanel, StatsPanel, CorrelationMatrix)   ※AnalysisTabs から変更予定
    │   ├── charts/ (ChartBuilder, ChartView)
    │   └── views/ (SavedViewList, SaveViewDialog)
    ├── hooks/                  # useAuth, useDatasets, useCsvAnalysis ...
    ├── repositories/           # 保存層（差し替え可能）
    │   ├── types.js            # インターフェース定義（JSDoc）
    │   ├── local/              # IndexedDB実装（第1段階）
    │   └── supabase/           # Supabase実装（第2段階）
    ├── workers/                # csvParse.worker.js など
    └── utils/                  # 純粋関数
        ├── detectEncoding.js
        ├── parseCsv.js
        ├── inferColumnTypes.js
        ├── filterRows.js / sortRows.js
        ├── aggregate.js
        ├── statistics.js
        └── correlation.js
```

- 構成を変えるときは CLAUDE.md のフォルダ構成も更新する
- `src/` 下に `repositories/` `workers/` を追加するため、**実装開始時にCLAUDE.mdへ反映**する

## 5. トレードオフ

| 決定                       | 利点                               | 欠点 / 見直す条件                                                             |
| -------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| 分析をブラウザ内で実行     | サーバー不要・無料枠に収まる・速い | 端末性能依存。数十万行/100MB超ならサーバー側集計（Postgres/Edge Functions）へ |
| CSV原本をStorageへ保存     | 再パース可能・元データ保持         | 無料枠のStorage容量に注意。容量上限に達したら古いデータ整理の仕組みを追加     |
| Repository抽象化           | ローカル→Supabase移行が容易        | 初期の実装量が少し増える                                                      |
| 権限は2値（全員/自分のみ） | RLSが単純で安全                    | グループ共有要望が出たら sharing テーブル追加                                 |
