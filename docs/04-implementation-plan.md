# 04. 実装計画

## 進め方のルール（CLAUDE.md より）
- **TDD**: 先に失敗するテスト（Red）→ 最小実装（Green）→ 整理（Refactor）
- 各フェーズの開始前に、使うライブラリ/APIの**最新公式ドキュメントを確認し、要点を共有**する
- ツール（Vite/Vitest/RTL）・ライブラリ（PapaParse/Recharts/React Router等）は**導入前にユーザーへ確認**
- **区切りごとにコミットするかユーザーに聞く**。mainへ直接pushしない（ブランチ→PR）
- 担当エージェント: `test_writer`（Red）→ `program_writer`（Green/Refactor）→ `ui_checker` / `performance_checker`

## フェーズ一覧
| Phase | 内容 | 完了の定義 |
|---|---|---|
| 0 | 準備 | Git初期化（要確認）、ツール導入（要確認）、.gitignore、CLAUDE.md更新 |
| 1 | CSV基盤ユーティリティ | detectEncoding / parseCsv / inferColumnTypes のテストが通る |
| 2 | 分析ロジック | filter / sort / aggregate / statistics / correlation のテストが通る |
| 3 | 保存層（ローカル） | Repository契約テストがLocal実装で通る |
| 4 | UI: 一覧・アップロード | アップロード→一覧表示→公開範囲変更が動く |
| 5 | UI: 分析画面 | テーブル/集計/グラフ/統計・相関が動く |
| 5b | UI: デザイン修正の反映 | 一覧にドロップ枠を統合、分析画面を縦1列の開閉セクション（4つ）にし、「？」解説が動く（下記） |
| 6 | ビュー保存・共有 | ビューの保存・復元・権限が動く（擬似ユーザー切替で確認） |
| 7 | 品質確認 | UI確認（レスポンシブ）、性能確認（10MB）、不具合修正 |
| 8 | Supabase移行 | Supabase実装が同じ契約テストを通り、実ユーザー間で共有できる |
| 9 | デプロイ | 静的ホスティング公開、運用メモ |

## 各フェーズの詳細

### Phase 0: 準備
1. `git init` の可否を確認（現在Git未初期化）
2. Vite + React、Vitest + React Testing Library 導入の可否を確認
3. `.gitignore`（`node_modules`, `.scratchpad/`, `.env*`, `dist`）作成
4. `repositories/` `workers/` `supabase/` を CLAUDE.md のフォルダ構成へ追記
5. 動作確認: ダミーテスト1本が実行できる

### Phase 1: CSV基盤（Red→Green→Refactor）
- tests: `detectEncoding.test.js` → `parseCsv.test.js` → `inferColumnTypes.test.js`
- 事前確認: PapaParse の最新公式ドキュメント（採用する場合）
- Shift_JISのテストデータはバイト列で用意（`.scratchpad/` で作成し、テスト内に埋め込む）
- 確認: テスト実行結果を提示

### Phase 2: 分析ロジック
- 順序: filterRows → sortRows → aggregate → statistics → correlation
- 標準偏差の定義（標本 / 母）をここで確定
- 大きめデータ（数万行）で処理時間を簡易計測

### Phase 3: 保存層（ローカル）
- `repositories/types.js` に契約を定義し、**契約テストを共通化**
- IndexedDB の最新仕様/ラッパー採用可否を確認
- LocalAuth は擬似ユーザー（切替UIつき）で権限ロジックを検証

### Phase 4: UI（一覧・アップロード）
- コンポーネントテスト先行: UploadForm のバリデーション（サイズ/拡張子/空）、DatasetList の出し分け
- ルーティング導入可否を確認
- Web Worker でパースし、UIが固まらないこと

### Phase 5: UI（分析画面）
- DataTable（大量行は先頭N件＋ページング、仮想スクロールは性能次第）
- FilterBar / AnalysisTabs / AggregatePanel / ChartBuilder / StatsPanel / CorrelationMatrix（画面は 05-ui-design.md の案B）
- Recharts の最新公式ドキュメントを確認してから実装

### Phase 5b: デザイン修正の反映（未着手。05-ui-design.md の 2・3・4 章）
- 先にテストを直す（Red）: 「アップロード画面」のテストを一覧のドロップ枠へ移す／タブ切替のテストをセクション開閉へ置き換える／「？」解説のテストを足す
- `UploadForm` → `DropZone`（ドラッグ中表示、ファイル選択、サイズ/拡張子/空の検証、成功したら `/datasets/:id` へ移動）、`UploadNotice`（アップロード直後の帯）
- `AnalysisTabs` → `CollapsibleSection`（見出し右端の開閉ボタン。順序: データ表 → グラフ → 集計 → 統計・相関）、`HelpButton`（統計用語の解説）
- `/upload` のルートとヘッダーのリンクを削除する
- 決定済み: アップロード直後の公開範囲は「非公開」（詳細画面で「公開にする」）／集計は独立した「集計」セクション
- モックは「集計」セクションを反映済み。非公開時の「公開にする」表示は、モックにはまだ無い（公開中の表示のみ）

### Phase 6: ビュー
- `config` のスキーマ検証、列不一致時の警告
- 他ユーザーのビューは閲覧のみ（編集/削除ボタン非表示＋Repository側でも拒否）

### Phase 7: 品質確認
- `ui_checker`: モバイル/タブレット/デスクトップ、日本語表示、アクセシビリティ
- `performance_checker`: 10MB CSV 読込・集計の計測、必要なら Worker 化/仮想化
- 不具合は `bug_fixer`

### Phase 8: Supabase移行
- 8a（済）: 認証だけを Supabase Auth に置き換え、擬似ユーザー（デモユーザーのパスワード・ユーザー切替）を削除した。`src/repositories/supabase/`（`SupabaseAuth` / `createSupabaseClient`）。設定手順は `docs/06-supabase-auth-setup.md`
- 8b（未着手）: datasets / views / profiles テーブル・RLS・Storage を作り、データ・ファイルを Supabase へ移す（以下の手順）

1. 最新の公式ドキュメントで確認: Auth、RLS、Storage のポリシー、**無料プランの上限と停止ポリシー**
2. `supabase/migrations/` にテーブルとRLSを定義
3. **RLSのテスト**（他人の private が見えない／更新できない）を先に書く
4. `SupabaseRepository` / `SupabaseAuth` を実装し、契約テストを通す
5. 環境変数（URL・anon key）は `.env`（Git管理外）。service_role キーはフロントに置かない
6. 実ユーザー2人以上で共有動作を確認

### Phase 9: デプロイ
- ホスティングは **GitHub Pages**。最新の公式ドキュメントで確認: 公開リポジトリの要否（無料プランの条件）、Vite の `base` 設定、SPAの直リンク/リロード対応（`HashRouter` を採用するか `404.html` 方式か）
- デプロイ手順（GitHub Actions 等）はPRで確認してから導入する
- Supabase の許可URL（Auth の Site URL）設定
- 運用メモ（容量監視、停止対策、バックアップ方針）を docs に追記

## リスクと対策
| リスク | 対策 |
|---|---|
| Shift_JIS判定の誤り | 厳密UTF-8デコード失敗時のみShift_JIS。手動切替を用意（任意） |
| 10MBの描画/計算が重い | Worker、ページング、必要に応じ仮想スクロール |
| RLS設定ミスによる情報漏えい | RLSテストを先に書く。service_role 不使用 |
| 無料枠の容量・停止 | 容量表示、古いデータ整理。停止対策はしない（OQ-2）。復帰手順を運用メモに記載 |
| サインアップ無効化の設定漏れ | Phase 8 で設定後、未登録メールでの登録がAPIで拒否されることを確認 |
| ローカルとSupabaseの挙動差 | 共通の契約テストで担保 |

## 将来の見直し候補
- グループ/個別ユーザーへの共有、閲覧用リンク
- 大容量データのサーバー側集計
- コメント、通知、リアルタイム共同編集
- 固定フォーマットのテンプレート、AI分析
- 集計結果・グラフのエクスポート

## 次のアクション
1. 本ドキュメント群のレビュー（OQ-1〜3 は決定済み。01 の「決定事項」参照）
2. Phase 0 の確認事項（git init、Vite/Vitest導入）に回答
