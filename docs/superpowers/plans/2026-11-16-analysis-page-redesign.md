# 分析画面の改修 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 分析画面を「列見出しのメニューで絞り込み・並べ替え・非表示」「左＝表／右上＝ピボットグラフ／右下＝ドラッグで組むピボット」の形に作り替える。

**Architecture:** 計算は純粋関数（`utils/`）に集め、単体テストで固める。設定は `views.config` の新しい形（設計書 9.1）を `DatasetDetailPage` が 1 つだけ持ち、パネルはそれを読み書きする。ドラッグは @dnd-kit/react の Provider をページに 1 つ置き、ドロップ結果は純粋関数 `applyFieldMove` で設定に反映する（jsdom ではドラッグの代わりに「＋」ボタンでテストする）。

**Tech Stack:** React 19 / Vite 8 / Vitest 5 + React Testing Library / Recharts 3.10 / **@dnd-kit/react 0.5.x（新規）**

**Spec:** `docs/superpowers/specs/2026-11-16-analysis-page-redesign-design.md`（以下「設計書」。章番号はこの文書のもの）

## 参照したドキュメントの要点

- **@dnd-kit/react 0.5.3**（2026-10 更新、React 18/19 対応）: 今の公式ドキュメントの本流。`@dnd-kit/core` 6.3.1 は「Legacy」扱い（2024-12 から更新なし）なので、新しいほうを使う。1.0 より前なので、`^0.5.3`（0.6 未満）に固定する
  - `DragDropProvider` で囲む。`useDraggable({ id, data })` / `useDroppable({ id, data, accept })` は `ref` を返す。`useDroppable` は `isDropTarget` も返す
  - `onDragEnd(event)`: `event.canceled` を先に見る。`event.operation.source`（`.id` `.data`）と `event.operation.target`（無いときは `null`）
  - センサーは既定で組み込み: `PointerSensor`（マウス・タッチ・ペン）と `KeyboardSensor`。`sensors` prop で変えられる
- **Recharts 3.x**: 複数の系列は `<Bar>` / `<Line>` を系列の数だけ並べ、それぞれに `dataKey` と `name`（凡例・ツールチップ）を付ける。`isAnimationActive={false}` は今のまま

## Global Constraints

- 25 万行（10MB）で、1 回の操作で 1 秒以上固まらない。目安: 絞り込み約 0.1 秒、集計 0.1〜0.5 秒、グラフは 2,000 点に間引く（設計書 3 章）
- 既存の保存済みビューは開ける。設定を黙って捨てない（設計書 9.2）
- キーボードだけ、スマホのタッチだけで、すべての操作ができる（設計書 2 章）
- 画面に列名を固定しない。docs/05 7 章の色・角丸、8 章のアクセシビリティ（実際の button/input、タッチ領域 44px、`aria-label`）に従う
- 処理の順番は「元の行 → 非表示の行を除く → 絞り込み → 並べ替え」（設計書 6.2）
- 「値から選ぶ」の候補は最大 1,000 種類。クロス集計の列は最大 50。グラフの系列は最大 8（設計書 6.1 / 7.2 / 8.2）
- TDD: 各タスクでテストを先に書き、失敗を確かめてから実装する
- コードのコメント・画面の文言は日本語。コミットメッセージも日本語
- コミットは区切りごとにユーザーへ確認する（勝手にコミットしない）。区切りは Task 5・Task 11・Task 13 の後を目安にまとめて聞く

## Review Focus

1. **列名に「:」「/」「"」が入っている CSV**（例「売上:税込」）で、ドラッグの id が壊れない → id を文字列から読み解かず、`data` で受け渡す（Task 4・Task 9 にテスト）
2. **キーが「新宿店 / りんご」の 1 列と、「新宿店」「りんご」の 2 列** の取り違え → ピボットの内部キーは JSON でつなぐ（Task 3 にテスト）
3. **空欄の値**: 「値から選ぶ」で「（空欄）」だけを選ぶ、ピボットのキーが空欄 → 空欄は `""` で持ち、画面では「（空欄）」と出す（Task 2・Task 3 にテスト）
4. **非表示の列に条件・並べ替えがかかったまま** → チップは残り、並べ替えも効いたまま（Task 12 にテスト）
5. **値が 1 つもない列（全部空欄）を「値」に置く、数値でない列を「値」に置く** → 件数だけになり、エラーにならない（Task 4・Task 10 にテスト）

---

## ファイル構成

| ファイル                                                                                                   | 役割                                                                                                               | 区分 |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---- |
| `src/utils/filterRows.js`                                                                                  | `in` / `notIn` を足す                                                                                              | 変更 |
| `src/utils/valueSelection.js`                                                                              | 列の値の数え上げ、選択 ⇔ 条件の変換                                                                                | 新規 |
| `src/utils/pivot.js`                                                                                       | ピボットの計算、表の見出し、グラフ用データ、値の表示名                                                             | 新規 |
| `src/utils/pivotEdit.js`                                                                                   | 枠の操作（ドロップ・追加・削除・関数の変更）の純粋関数                                                             | 新規 |
| `src/utils/hiddenRows.js`                                                                                  | 非表示の行を除く、元の行番号の索引                                                                                 | 新規 |
| `src/components/views/viewConfig.js`                                                                       | 新しい形・古い形の変換・検証                                                                                       | 変更 |
| `src/hooks/usePaging.js`                                                                                   | 100 行ページング（`DataTable` から抜き出す）                                                                       | 新規 |
| `src/components/analysis/CollapsibleSection.jsx`                                                           | `defaultOpen`                                                                                                      | 変更 |
| `src/components/analysis/DataTable.jsx`                                                                    | 見出しの差し込み・行の非表示ボタン                                                                                 | 変更 |
| `src/components/analysis/ColumnMenu.jsx`                                                                   | 列見出しのメニュー（設計書 6.1）                                                                                   | 新規 |
| `src/components/analysis/AnalysisTable.jsx`                                                                | データ表 ＝ `DataTable` ＋ `ColumnMenu` ＋ ドラッグできる見出し                                                    | 新規 |
| `src/components/analysis/FilterBar.jsx`                                                                    | 設計書 5.2 の形に作り替え                                                                                          | 変更 |
| `src/components/dnd/FieldDnd.jsx`                                                                          | `FieldDndProvider` / `DraggableField` / `FieldSlot`                                                                | 新規 |
| `src/components/analysis/PivotPanel.jsx`                                                                   | ピボットの枠と列名一覧                                                                                             | 新規 |
| `src/components/analysis/PivotTable.jsx`                                                                   | 集計結果の表（2 段見出し）                                                                                         | 新規 |
| `src/components/charts/ChartBuilder.jsx`                                                                   | 種類ボタン・共通の枠・散布図の枠                                                                                   | 変更 |
| `src/components/charts/ChartView.jsx`                                                                      | 複数の系列                                                                                                         | 変更 |
| `src/components/datasets/DatasetDetailPage.jsx`                                                            | 新しい設定・処理の順番・Grid                                                                                       | 変更 |
| `src/analysis.css`                                                                                         | Grid・メニュー・枠・チップ                                                                                         | 変更 |
| `src/components/analysis/AggregatePanel.jsx`、`aggregationNames.js`、`src/utils/aggregate.js` とそのテスト | `PivotPanel` / `pivot.js` に置き換わるので **削除**（Task 12。ほかから使われていないことを `grep` で確かめてから） | 削除 |

---

### Task 1: `filterRows` に `in` / `notIn` を足す

**Files:**

- Modify: `src/utils/filterRows.js`
- Test: `tests/utils/filterRows.test.js`

**Interfaces:**

- Produces: `filterRows(rows, filters)`。`filters[i]` に `{ column, op: "in" | "notIn", values: string[] }` を受け付ける。比べるのはセルの文字列そのもの（空欄は `""`）

- [ ] **Step 1: 失敗するテストを書く**（`describe("in / notIn")` に追加）
  - `in: values に含まれる行だけ残す`: 店舗 `["東京","大阪"]` → 4 行
  - `in: 空欄 "" を選べる`: 1 行だけ空欄の CSV で `values: [""]` → 1 行
  - `notIn: values に含まれる行を除く`: 店舗 `["東京"]` → 3 行
  - `in: ほかの条件と AND`: `in 店舗 [東京,大阪]` ＋ `gte 売上 1500` → 2 行
  - `in: 存在しない列は InvalidFilterError`
- [ ] **Step 2: 実行して失敗を確かめる** — `npx vitest run tests/utils/filterRows.test.js` → `未対応の条件です: in` で FAIL
- [ ] **Step 3: 実装** — `buildPredicate` の `switch` に `in` / `notIn` を足す。`values` は `Set` にしてから比べる（25 万行で `includes` を繰り返さない）
- [ ] **Step 4: 実行して通ることを確かめる** — 同じコマンドで PASS

### Task 2: 値の数え上げと、選択 ⇔ 条件の変換

**Files:**

- Create: `src/utils/valueSelection.js`
- Test: `tests/utils/valueSelection.test.js`

**Interfaces:**

- Produces:
  - `countValues(rows: object[], column: string): { value: string, count: number }[]` — 件数の多い順、同数は値の昇順（`localeCompare(…, "ja")`）。空欄は `""`
  - `selectionToFilter(column: string, selected: Set<string>, allValues: string[]): Filter | null` — 設計書 6.1 の規則。全部選んだら `null`。0 個なら `throw new RangeError`
  - `filterToSelection(filter: Filter | undefined, allValues: string[]): Set<string>` — 条件なしなら全部
  - `findValueFilter(filters, column): { index: number, filter: Filter } | null` — その列の `in` / `notIn` を探す
  - `EMPTY_LABEL = "（空欄）"`、`VALUE_LIMIT = 1000`

- [ ] **Step 1: 失敗するテストを書く**
  - `countValues: 件数の多い順、同数は値の昇順`: 東京2・大阪2・名古屋1 → `[大阪2, 東京2, 名古屋1]`
  - `countValues: 空欄は "" として数える`
  - `selectionToFilter: 選んだほうが少なければ in`: 全 5 種から 2 つ → `{ column, op: "in", values: [2 つ] }`
  - `selectionToFilter: 外したほうが少なければ notIn`: 全 5 種から 4 つ → `{ op: "notIn", values: [外した 1 つ] }`
  - `selectionToFilter: 同数なら in`: 全 4 種から 2 つ → `in`
  - `selectionToFilter: 全部選んだら null`
  - `selectionToFilter: 0 個は RangeError`
  - `selectionToFilter: 空欄だけを選べる`: `selected = {""}` → `in [""]`
  - `filterToSelection: notIn は外した値以外`、`in は選んだ値`、`undefined は全部`
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/utils/valueSelection.test.js` → モジュールが無くて FAIL
- [ ] **Step 3: 実装**
- [ ] **Step 4: 通ることを確かめる**

### Task 3: ピボットの計算

**Files:**

- Create: `src/utils/pivot.js`
- Test: `tests/utils/pivot.test.js`

**Interfaces:**

- Consumes: `parseNumber`, `normalizeDate`（`utils/parseValue.js`）
- Produces:
  ```js
  // spec = { rows: string[], columns: string[], values: { column?: string, fn: "sum"|"avg"|"count"|"min"|"max" }[] }
  // typeOf = (columnName) => "number" | "date" | "string"
  pivot(rows, spec, typeOf) => {
    rowFields: string[], columnFields: string[], values: Value[],
    columnKeys: string[][],      // 昇順・最大 50。列の枠が空なら [[]]
    columnKeyTotal: number,      // 切る前の数
    records: { rowKey: string[], cells: (number|null)[] }[],
    // cells[c * values.length + v] = 列キー c・値 v の集計
  } | null                       // values が空なら null
  valueLabel(value) => string    // "売上・合計" / column なしの count は "件数"
  FN_LABELS = { sum: "合計", avg: "平均", count: "件数", min: "最小", max: "最大" }
  keyLabel(key: string[]) => string   // " / " でつなぐ。"" は "（空欄）"
  pivotSeries(result, maxSeries = 8) => {
    data: { x: string, [seriesKey: string]: number|null }[],   // x = keyLabel(rowKey)
    series: { key: string, name: string }[],                   // key は "s0", "s1", …
    seriesTotal: number,
  }
  COLUMN_KEY_LIMIT = 50
  ```
- 行の並び: グループが最初に現れた順。列キーの並び: `typeOf` に合わせて昇順（number は `parseNumber`、date は `normalizeDate` の文字列比較、string は `localeCompare(…, "ja")`、読めない値と空欄は最後）。複数列は左の列から入れ子
- 系列名: 列の枠が空なら `valueLabel(v)`。値が 1 つなら `keyLabel(columnKey)`。両方あるなら `${keyLabel(columnKey)} / ${valueLabel(v)}`
- 集計関数の意味は今の `aggregate.js` と同じ（count は行数。ほかは数値として読めた値だけ。読めた値が 0 個なら `null`）

- [ ] **Step 1: 失敗するテストを書く**（`SALES` 5 行を使う。既存 `tests/utils/aggregate.test.js` のケースは、ここへ移す）
  - `行だけ: 店舗ごとの売上合計（最初に現れた順）`: rowKey `[東京]` `[大阪]` `[名古屋]`、cells `[1500]` `[3500]` `[800]`
  - `行＋列: 店舗 × 商品`: columnKeys `[[みかん],[りんご]]`（昇順）、東京の cells `[500, 1000]`、名古屋の みかん は `null`
  - `値だけ: 全体を 1 行`: `records.length === 1`、rowKey `[]`
  - `値が空なら null`
  - `列キーの昇順: 数値は数として`（`"10"` が `"9"` の後）、`日付は日付として`、`空欄は最後`
  - `列キーが 50 を超えたら 50 で切り、columnKeyTotal は全数`: 60 種の列 → `columnKeys.length === 50`、`columnKeyTotal === 60`
  - `関数 5 種`: sum / avg / count / min / max を 1 回で
  - `数値でない列の count`: `{ column: "店舗", fn: "count" }` → 行数
  - **Review Focus 2** `"a / b" の 1 列キーと "a","b" の 2 列キーを区別する`
  - **Review Focus 3** `空欄のキーは "" で持ち、keyLabel は「（空欄）」`
  - `pivotSeries: 列なし・値 2 つ → 系列名は値の表示名`、`値 1 つ・列あり → 系列名は列キー`、`両方 → "りんご / 売上・合計"`
  - `pivotSeries: 系列が 8 を超えたら 8 で切り、seriesTotal は全数`
  - `valueLabel: { fn: "count" } は「件数」、{ column: "売上", fn: "sum" } は「売上・合計」`
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/utils/pivot.test.js`
- [ ] **Step 3: 実装** — 1 回の走査で `Map<rowKeyJSON, Map<colKeyJSON, stats[]>>` に積み、最後に列キーを並べて切る（25 万行で 0.5 秒以内）
- [ ] **Step 4: 通ることを確かめる**

### Task 4: 枠の操作（純粋関数）

**Files:**

- Create: `src/utils/pivotEdit.js`
- Test: `tests/utils/pivotEdit.test.js`

**Interfaces:**

- Produces:
  ```js
  // slot: "rows" | "columns" | "values" | "scatterX" | "scatterY"
  // state = { pivot: Pivot | null, scatter: { x: string, y: string } | null }
  applyFieldMove(state, { field, from: { slot, index } | null, to: { slot, index? } | null }, typeOf) => state
  setValueFn(pivot, index, fn) => pivot
  defaultFn(columnType) => "sum" | "count"     // number → sum、それ以外 → count
  allowedFns(columnType) => string[]           // number → 5 種、それ以外 → ["count"]
  ```
- 規則（設計書 7.1 / 8.3）:
  - `to === null`（枠の外）かつ `from` あり → 元の枠から外す
  - `rows` / `columns` に入れる: 同じ列が反対側（rows ⇔ columns）にあれば、そちらから外す。同じ枠にすでにあれば、位置だけ動かす
  - `values` に入れる: `{ column: field, fn: defaultFn(type) }`。同じ `column`・`fn` がすでにあれば入れない（values 内の並べ替えは除く）
  - `values` から `rows` などへ動かしたら、`values` からは外す（`from.slot` から外して `to.slot` に入れる、が共通の動き）
  - `scatterX` / `scatterY`: 数値の列だけ受け付ける（ほかは state をそのまま返す）。1 つだけ持つ（置き換え）
  - 3 つの枠がすべて空になったら `pivot: null`
  - `index` が無ければ末尾に入れる

- [ ] **Step 1: 失敗するテストを書く**
  - `一覧から rows へ（from なし）→ 末尾に入る`
  - `rows の 0 番目を columns へ → rows から消え columns に入る`
  - `店舗が columns にあるとき rows へ入れる → columns から消える`
  - `同じ枠の中で index 0 へ → 並びが変わる`
  - `枠の外へ（to なし）→ 外れる。全部空なら pivot は null`
  - `values へ: 数値列は sum、文字列列は count`
  - `values に同じ列・同じ関数は二重に入らない`
  - `scatterX に文字列列は入らない`、`scatterY は置き換え`
  - `setValueFn: 2 番目の値を avg に`
  - **Review Focus 1** `列名に ":" "/" '"' を含んでいても動く`（`"売上:税込"` を rows → values）
  - **Review Focus 5** `allowedFns("string") は ["count"]`
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/utils/pivotEdit.test.js`
- [ ] **Step 3: 実装**
- [ ] **Step 4: 通ることを確かめる**

### Task 5: ビュー設定の新しい形と、古い形の変換

**Files:**

- Modify: `src/components/views/viewConfig.js`
- Create: `src/utils/hiddenRows.js`
- Test: `tests/components/views/viewConfig.test.js`（新規）、`tests/utils/hiddenRows.test.js`

**Interfaces:**

- Produces:
  ```js
  EMPTY_CONFIG = { filters: [], sort: null, hiddenRows: [], hiddenColumns: [], pivot: null, chart: null }
  migrateConfig(raw) => { config, notes: string[] }   // 設計書 9.2 の表。notes は「グラフの設定を集計（行＝店舗、値＝売上の合計）に変換しました」
  sanitizeConfig(raw, columnNames, rowCount) => { config, disabled: string[], notes: string[] }  // 中で migrateConfig を呼ぶ
  findMissingColumns(config, columnNames) => string[]   // pivot の 3 枠・hiddenColumns・chart.scatter も見る
  excludeHiddenRows(rows, hiddenRows: number[]) => rows  // 空なら rows をそのまま返す（同じ参照）
  buildRowIndex(rows) => WeakMap<object, number>
  ```
- 無効にしたときの `disabled` の文言: 既存の「絞り込み条件（列）」「並べ替え（列）」に加え、「集計の行（列）」「集計の列（列）」「集計の値（列）」「非表示の列（列）」「散布図の軸（列）」

- [ ] **Step 1: 失敗するテストを書く**
  - `古い aggregation は pivot（rows=groupBy, columns=[], values=metrics）になる`
  - `古い chart（scatter）は chart.scatter になる`
  - `古い chart（棒・集計あり）は x/y を捨て、notes は空`
  - `古い chart（棒・集計なし・x=店舗・y=売上）は pivot（rows=[店舗], values=[売上 sum]）になり、notes に「行＝店舗、値＝売上の合計」を含む`
  - `hiddenRows / hiddenColumns が無ければ []`
  - `hiddenRows のうち rowCount 以上は捨て、disabled には出さない`
  - `データにない列（pivot.columns・hiddenColumns・scatter.x）は無効にして disabled に出す`
  - `新しい形はそのまま通る（同じ値）`
  - `findMissingColumns は pivot・hiddenColumns・scatter を見る`
  - `excludeHiddenRows: [1,3] を除く。空なら同じ参照を返す`
  - `excludeHiddenRows: 25 万行・1,000 行を除いて 0.1 秒未満`（`performance.now()` で測る。既存の性能テストの書き方に合わせる）
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/components/views/viewConfig.test.js tests/utils/hiddenRows.test.js`
- [ ] **Step 3: 実装** — `hiddenRows` は `Set` にして `rows.filter((_, i) => !set.has(i))`
- [ ] **Step 4: 通ることを確かめる**
- [ ] **Step 5: ここまでの全テスト** — `npx vitest run tests/utils tests/components/views` が PASS。**ユーザーにコミットするか聞く**（例「絞り込み・ピボット・ビュー設定の純粋関数を追加」）

### Task 6: 開閉の初期値・ページングの共通化・集計結果の表

**Files:**

- Modify: `src/components/analysis/CollapsibleSection.jsx`、`src/components/analysis/DataTable.jsx`
- Create: `src/hooks/usePaging.js`、`src/components/analysis/PivotTable.jsx`
- Test: `tests/components/analysis/CollapsibleSection.test.jsx`、`tests/hooks/usePaging.test.jsx`、`tests/components/analysis/PivotTable.test.jsx`

**Interfaces:**

- Produces:
  - `CollapsibleSection({ title, defaultOpen = true, className?, children })`
  - `usePaging(rows, pageSize = 100) => { page, pageCount, visible, start, goTo }`（rows が変わったら 1 ページ目。今の `DataTable` の処理を移す）
  - `Pager({ page, pageCount, onChange })`（`DataTable.jsx` から export。前へ・次へ）
  - `PivotTable({ result })` — `result` は `pivot()` の戻り値。`aria-label="集計結果"` の region。`columnKeyTotal > 50` のとき注記「列が多いため、先頭 50 列だけを表示しています（全 N 列）」

- [ ] **Step 1: 失敗するテストを書く**
  - `defaultOpen={false} なら最初は閉じ、aria-expanded="false"`
  - `usePaging: 250 行で pageCount 3、rows が変わると 0 ページ目`
  - `PivotTable: 列の枠が空なら 1 段の見出し（店舗・売上・合計）`
  - `PivotTable: 列の枠ありなら 2 段（上: みかん・りんご、下: 値の名前）。値が 1 つなら値の段は出さない`
  - `PivotTable: 空欄のキーは「（空欄）」と出す`
  - `PivotTable: 列が 60 なら 50 列だけ出し、注記を出す`
  - `PivotTable: 101 グループでページングする`
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 実装** — `DataTable` は `usePaging` と `Pager` を使うように変える（見た目と既存テストは変えない）
- [ ] **Step 4: 通ることを確かめる** — 上の 3 ファイルと `tests/components/analysis/DataTable.test.jsx` が PASS

### Task 7: 列見出しのメニュー

**Files:**

- Create: `src/components/analysis/ColumnMenu.jsx`
- Modify: `src/analysis.css`
- Test: `tests/components/analysis/ColumnMenu.test.jsx`

**Interfaces:**

- Consumes: `countValues`, `selectionToFilter`, `filterToSelection`, `findValueFilter`, `EMPTY_LABEL`, `VALUE_LIMIT`（Task 2）
- Produces:
  ```jsx
  <ColumnMenu
    column={{ name, type }}
    candidateRows={rows}        // 非表示の行・ほかの列の条件をかけたあとの行（この列の in/notIn は除く。親が作る）
    filters={filters}           // 今の全条件（この列の値の条件・条件の有無の判定に使う）
    sort={sort}
    onSortChange={(sort | null) => void}
    onApplyValues={(filter | null) => void}    // その列の in/notIn を置き換える（null は外す）
    onAddCondition={(filter) => boolean}       // false なら閉じない（親が InvalidFilterError を出す）
    conditionError={string | null}             // 自由入力のエラー（親から）
    onHide={() => void}
  />
  ```
- ▼ ボタン: `aria-label="「店舗」の列のメニュー"`、`aria-haspopup="dialog"`、`aria-expanded`。条件があるときは `data-active="true"` とアイコン（▼ → ⏷ のような別の字）。中身は `role="dialog"` `aria-label="「店舗」の列の操作"`
- 文言は設計書 6.1 の図のとおり（「昇順」「降順」「並べ替えを解除」「値から選ぶ」「自由入力」「検索」「すべて選択」「適用」「キャンセル」「追加」「この列を非表示」）。1,000 種類を超えたら「ほか N 種類。検索で絞り込んでください」
- 演算子の一覧は今の `FilterBar` の `OPERATORS` をこのファイルへ移す

- [ ] **Step 1: 失敗するテストを書く**（`userEvent` を使う）
  - `▼ で開き、最初の操作できる部品にフォーカス。Esc で閉じて ▼ にフォーカスが戻る`
  - `外側をクリックすると閉じる`
  - `昇順で onSortChange({ column: "売上", direction: "asc" })、並べ替えを解除で null`
  - `値から選ぶ: 値と件数（「東京 (2)」）が多い順に出る`
  - `値から選ぶ: 検索「阪」で大阪だけ。検索中の「すべて選択」は検索に合う値だけを切り替える`
  - `値から選ぶ: 東京だけ外して適用 → onApplyValues({ column: "店舗", op: "notIn", values: ["東京"] })`
  - `値から選ぶ: 全部外すと「適用」が押せない`
  - `値から選ぶ: 既存の notIn を開くと、外した値以外にチェックが付いている`
  - `値から選ぶ: 1,200 種類なら 1,000 個だけ出し「ほか 200 種類」`
  - `値から選ぶ: 空欄は「（空欄）」として選べる`
  - `自由入力: 「以上」「1500」で追加 → onAddCondition({ column: "売上", op: "gte", value: "1500" })、true なら閉じる`
  - `自由入力: onAddCondition が false なら閉じず、conditionError を role="alert" で出す`
  - `この列を非表示 → onHide`
  - `条件がある列は ▼ に data-active="true"`
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/components/analysis/ColumnMenu.test.jsx`
- [ ] **Step 3: 実装** — 外側クリックは `pointerdown` を `document` で拾う。CSS はポップオーバー（`position: absolute`、幅 280px、スマホ幅では画面幅 − 32px まで）
- [ ] **Step 4: 通ることを確かめる**

### Task 8: データ表の見出し・行の非表示と、フィルタバー

**Files:**

- Modify: `src/components/analysis/DataTable.jsx`、`src/components/analysis/FilterBar.jsx`、`src/analysis.css`
- Create: `src/components/analysis/AnalysisTable.jsx`
- Test: `tests/components/analysis/DataTable.test.jsx`、`tests/components/analysis/FilterBar.test.jsx`（作り替え）、`tests/components/analysis/AnalysisTable.test.jsx`

**Interfaces:**

- Consumes: `ColumnMenu`（Task 7）、`buildRowIndex`（Task 5）、`DraggableField`（Task 9。**Task 8 の時点では `renderHeader` で名前だけを出し、Task 9 で差し替える**）
- Produces:
  - `DataTable({ columns, rows, label, renderHeader?: (column) => ReactNode, rowIndexOf?: (row) => number, onHideRow?: (index) => void })` — `onHideRow` があるとき、各行の左端に「この行を非表示」ボタン（`aria-label="${index + 1} 行目を非表示"`、index は元の行番号）
  - `AnalysisTable({ columns, rows, allRowsForCandidates, rowIndexOf, settings, onSettingsChange, conditionError, onAddCondition })` — `settings.hiddenColumns` の列を除いて `DataTable` に渡し、見出しに `ColumnMenu` を差し込む。並べ替え中の列は見出しに ▲/▼（`aria-sort` も付ける）。`candidateRows` は「この列の in/notIn を除いた条件」で `allRowsForCandidates` を絞って作る（`filterRows` を使う。メニューを開いたときだけ計算する）
  - `FilterBar({ filters, hiddenRowCount, hiddenColumns, onRemoveFilter(index), onShowAllRows(), onShowColumn(name), onClearAll() })`
- チップの文言（設計書 5.2）: `in` は「店舗: 東京, 大阪」、3 つを超えたら先頭 2 つ＋「ほか N 件」（例 5 つ →「店舗: 東京, 大阪 ほか 3 件」）、`notIn` は「店舗: 東京 以外」、空欄は「（空欄）」。何も無いときは「列見出しの ▼ から絞り込めます」。「すべて解除」は何かあるときだけ出す

- [ ] **Step 1: 失敗するテストを書く**
  - `DataTable: onHideRow があるとき、行の左端のボタンで元の行番号を渡す`（並べ替え後の行でも、`rowIndexOf` の値）
  - `DataTable: renderHeader で見出しを差し替えられる`
  - `AnalysisTable: hiddenColumns の列は出ない`
  - `AnalysisTable: 並べ替え中の列は aria-sort="descending"`
  - `AnalysisTable: メニューの「この列を非表示」で hiddenColumns に足して onSettingsChange`
  - `AnalysisTable: 値の候補は、ほかの列の条件をかけたあとの行から数える（自分の列の notIn は除く）`
  - `FilterBar: in / notIn / 演算子のチップの文言`
  - `FilterBar: 「非表示の行 3件」の × で onShowAllRows、「非表示の列: 単価」の × で onShowColumn("単価")`
  - `FilterBar: 「すべて解除」で onClearAll。何も無いときは案内文だけで、ボタンは出ない`
  - `FilterBar: 「＋条件を追加」と並べ替えの欄は無い`
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 実装** — 既存の `FilterBar.test.jsx` のうち、「＋条件を追加」・並べ替えのセレクトのテストは削除し、新しい振る舞いのテストに置き換える
- [ ] **Step 4: 通ることを確かめる**

### Task 9: ドラッグの土台（@dnd-kit/react）

**Files:**

- Modify: `package.json`、`package-lock.json`（`npm install @dnd-kit/react@^0.5.3`）
- Create: `src/components/dnd/FieldDnd.jsx`
- Modify: `src/components/analysis/AnalysisTable.jsx`（見出しの名前を `DraggableField` にする）、`src/analysis.css`
- Test: `tests/components/dnd/FieldDnd.test.jsx`

**Interfaces:**

- Consumes: `applyFieldMove`（Task 4）
- Produces:
  ```jsx
  <FieldDndProvider onMove={(move) => void}>   // move = applyFieldMove の第 2 引数の形
  <DraggableField field="店舗" from={{ slot, index } | null} surface="pivot">{children}</DraggableField>
  <FieldSlot
    slot="rows"            // applyFieldMove の slot
    surface="pivot"        // "pivot" | "chart"。droppable の id は `${surface}-${slot}`（列名は id に入れない）
    label="行"
    items={[{ field, label }]}   // チップに出す（値は「売上・合計」）
    addOptions={[{ name, type }]}      // 「＋」で選べる列
    onAdd={(field) => void}
    onRemove={(index) => void}
    renderChipExtra={(item, index) => ReactNode}   // 値の関数メニューなど
  />
  ```
- `useDraggable({ id: \`${surface}-${from?.slot ?? "list"}-${index ?? 0}-${uid}\`, data: { field, from } })`。id は `useId()` で一意にし、列名は **`data` でだけ** 運ぶ
- チップ（枠の中）も `useDroppable({ id, data: { slot, index } })` にして、チップの上に落としたら、その位置に入れる
- `onDragEnd`: `canceled` なら何もしない。`target` が無ければ `to: null`。`target.data` から `{ slot, index }` を取り、`onMove({ field: source.data.field, from: source.data.from, to })`
- 「＋」ボタン: `aria-label="行に列を追加"`。押すと列名の一覧（`role="listbox"` か、`button` の一覧）を出し、選ぶと `onAdd(name)`。× は `aria-label="行から「店舗」を外す"`
- ドラッグ中・ドロップ先の上では、枠の線を太く・色を変え、「ここに置く」と文字でも出す

- [ ] **Step 1: 失敗するテストを書く**
  - `@dnd-kit/react を読み込んだ FieldDndProvider が jsdom で描ける`（ここで動かなければ、作業を止めてユーザーに相談する）
  - `FieldSlot: items をチップで出し、× で onRemove(index)`
  - `FieldSlot: 「＋」→ 列を選ぶと onAdd("店舗")`
  - `FieldSlot: キーボードだけで「＋」→ 選択 → 追加ができる`
  - **Review Focus 1** `列名 "売上:税込" のチップも × と ＋ で正しく扱える`
  - `onDragEnd の受け渡し`: `FieldDndProvider` から `handleDragEnd` を export して単体で呼び、`{ operation: { source: { data }, target: { data } }, canceled: false }` → `onMove` の引数を確かめる。`canceled: true` なら呼ばない。`target: null` なら `to: null`
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 実装**
- [ ] **Step 4: 通ることを確かめる** — `npx vitest run tests/components/dnd tests/components/analysis/AnalysisTable.test.jsx`

### Task 10: ピボットパネル

**Files:**

- Create: `src/components/analysis/PivotPanel.jsx`
- Test: `tests/components/analysis/PivotPanel.test.jsx`

**Interfaces:**

- Consumes: `FieldSlot`, `DraggableField`（Task 9）、`applyFieldMove`, `setValueFn`, `allowedFns`（Task 4）、`valueLabel`, `FN_LABELS`（Task 3）、`PivotTable`（Task 6）
- Produces: `PivotPanel({ columns, pivot, result, onMove(move), onPivotChange(pivot) })` — `result` は親が計算した `pivot()` の戻り値（グラフと共有するため）
- 列名の一覧: 全列（非表示の列も含む）を `DraggableField from={null}` で並べる。見出し「列名」
- 値のチップ「売上・合計 ▼」を押すと `allowedFns` の関数を選べる（`aria-label="「売上・合計」の集計方法"`）
- `result === null` のとき「値の枠に列を置くと集計します」

- [ ] **Step 1: 失敗するテストを書く**
  - `列名の一覧に全列（非表示の列も）が出る`
  - `行の「＋」で店舗を選ぶ → onMove({ field: "店舗", from: null, to: { slot: "rows" } })`
  - `値の関数を「平均」にする → onPivotChange（values[0].fn === "avg"）`
  - **Review Focus 5** `数値でない列の値チップは「件数」しか選べない`
  - `result が null なら案内文、あれば PivotTable（region「集計結果」）`
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 実装**
- [ ] **Step 4: 通ることを確かめる**

### Task 11: ピボットグラフ

**Files:**

- Modify: `src/components/charts/ChartView.jsx`、`src/components/charts/ChartBuilder.jsx`
- Test: `tests/components/charts/ChartView.test.jsx`・`ChartView.ticks.test.jsx`・`ChartView.tickWidth.test.jsx`（新しい props に書き換え）、`tests/components/charts/ChartBuilder.test.jsx`（作り替え）

**Interfaces:**

- Consumes: `pivotSeries`, `valueLabel`（Task 3）、`FieldSlot`（Task 9）
- Produces:
  - `ChartView({ type, data, series, xName })` — 棒・折れ線・円: `data = [{ x, s0, s1 }]`、`series = [{ key, name }]`。散布図: `data = [{ x: number, y: number }]`、`series = [{ key: "y", name }]`、`xName` は X 軸名。間引き（2,000 点）・X 軸ラベルの間引き・`role="img"` は今のまま。`aria-label` は「棒グラフ: X軸 店舗、系列 りんご・みかん」のように系列名を並べる（3 つを超えたら「ほか N」）。円は `series[0]` だけ
  - `ChartBuilder({ columns, chart, pivot, result, filteredRows, onChartChange, onMove })`
    - 種類ボタン 4 つ（`aria-pressed`）。初期は棒
    - 棒・折れ線・円: `FieldSlot surface="chart"` を 3 つ（「X軸」= rows、「系列」= columns、「Y軸」= values）
    - 散布図: `FieldSlot` を 2 つ（「X軸」= scatterX、「Y軸」= scatterY。`addOptions` は数値列だけ）。描くのは `filteredRows`
    - 注記: 系列が 8 を超えたら「系列が多いため、先頭 8 系列だけを描いています（全 N 系列）」。円で系列が 2 つ以上なら「円グラフは最初の系列（○○）だけを描いています」
    - 値が無いとき「Y軸（集計の値）に列を置くと、グラフを表示します」。散布図で X/Y が揃わないとき「X軸とY軸に数値の列を置くと、散布図を表示します」

- [ ] **Step 1: 失敗するテストを書く**
  - `ChartView: 系列 2 つの棒は <Bar> が 2 本（凡例に 2 つの名前）`
  - `ChartView: 円は最初の系列だけ`
  - `ChartView: 2,000 点を超えると間引きの注記`（既存のテストを新しい props に直す）
  - `ChartBuilder: 種類ボタンで onChartChange({ type: "line", scatter })、押したボタンは aria-pressed="true"`
  - `ChartBuilder: グラフの「X軸」の ＋ で店舗 → onMove({ field: "店舗", from: null, to: { slot: "rows" } })`（集計の行と同じ）
  - `ChartBuilder: 系列 9 つで注記`、`円で系列 2 つ以上で注記`
  - `ChartBuilder: 散布図に切り替えると X/Y の枠になり、数値列だけ選べる。棒に戻すと集計の枠に戻り、scatter は残る`
  - `ChartBuilder: 値が無いときの案内文`
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 実装**
- [ ] **Step 4: 通ることを確かめる** — `npx vitest run tests/components/charts`
- [ ] **Step 5: ここまでの全テスト** — `npx vitest run`。`DatasetDetailPage` のテストはまだ古い UI を前提に落ちてよい（Task 12 で直す）。落ちているのが `DatasetDetailPage*.test.jsx`・`analysisPerformance.test.jsx`・`integration`・`samples` だけであることを確かめる。**ユーザーにコミットするか聞く**（例「列見出しメニュー・ピボット・ピボットグラフの部品を追加」）

### Task 12: 分析画面に組み込む

**Files:**

- Modify: `src/components/datasets/DatasetDetailPage.jsx`、`src/analysis.css`、`src/styles.css`
- Delete: `src/components/analysis/AggregatePanel.jsx`、`src/components/analysis/aggregationNames.js`、`src/utils/aggregate.js`、`tests/components/analysis/AggregatePanel.test.jsx`、`tests/utils/aggregate.test.js`（Task 3 にケースを移してあること、`grep -r "aggregate\|aggregationNames\|AggregatePanel" src tests` でほかに使われていないことを確かめてから）
- Test: `tests/components/datasets/DatasetDetailPage.test.jsx`（古い UI を使うテストを書き換え）

**Interfaces:**

- Consumes: Task 1〜11 のすべて
- `settings` は `EMPTY_CONFIG` の形。計算の流れ（それぞれ `useMemo`）:
  `rows → excludeHiddenRows(rows, hiddenRows) → filterRows → sortRows` → `pivot(sorted, settings.pivot, typeOf)` → `PivotPanel` と `ChartBuilder` に同じ `result`
- `rowIndexOf` は `buildRowIndex(rows)`（読み込み時に 1 回）
- `applyFieldMove` に渡す state は `{ pivot: settings.pivot, scatter: settings.chart?.scatter ?? null }`。戻り値の `pivot` は `settings.pivot` へ、`scatter` は `settings.chart = { type: settings.chart?.type ?? "bar", scatter }` へ書き戻す
- ビューの読み込みは `sanitizeConfig(view.config, columnNames, rows.length)`。`disabled` と `notes` をつないで `viewWarning` に出す
- 保存する `config` は `settings` そのもの（今の `narrowChart` は不要になるので消す）
- 配置（設計書 5.1）: `FieldDndProvider` の中に `<div className="analysis-grid">`（`.analysis-grid__table` / `__chart` / `__pivot`）。その下に統計・相関（`defaultOpen={false}`）
- CSS: `.page:has(> .detail) { max-width: 1600px }`。`.analysis-grid` は `@media (min-width: 1024px)` で `grid-template-columns: minmax(0, 3fr) minmax(0, 2fr)`、表は `grid-row: span 2`。表の箱は `max-height: calc(100vh - 160px)`・縦スクロール・`thead th { position: sticky; top: 0 }`。1024px 未満は 1 列

- [ ] **Step 1: 失敗するテストを書く／書き換える**（`DatasetDetailPage.test.jsx`）
  - `セクション: 左にデータ表、右にグラフと集計（analysis-grid の中）、統計・相関は初期で閉じる`（既存の「縦 1 列・初期はすべて開く」を置き換え）
  - `列メニューで「値から選ぶ」→ 東京だけ外す → データ表・集計・統計が 3 行になり、チップ「店舗: 東京 以外」`
  - `列メニューの自由入力で不正な条件（数値列に abc）→ メニューの中に alert、条件は増えない`
  - `列メニューの降順で、データ表が売上の降順になる`
  - `行の非表示: 2 行目を隠すとデータ表・集計・統計から消え、「非表示の行 1件」の × で戻る`
  - `列の非表示: 単価を隠すと表から消え、集計の列名一覧には残る`
  - **Review Focus 4** `条件と並べ替えのかかった列を隠しても、チップは残り、並べ替えも効いたまま`
  - `ピボット: 行に店舗、値に売上（＋ボタン）→ 集計結果に 3 行、グラフ（role=img）が出る`
  - `ピボット: グラフの「系列」に商品を置くと、集計の「列」にも出る`
  - `散布図: 数量 × 売上を描ける`
  - `ビュー: 保存した config が新しい形（hiddenRows・hiddenColumns・pivot・chart.scatter を含む）`
  - `ビュー: 古い形（aggregation と集計なしの棒）のビューを開くと、ピボットに変換され、「変換しました」の警告が出る`
  - 既存の作成者の操作・他人のビューのテストは、そのまま通ること
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/components/datasets`
- [ ] **Step 3: 実装** — 古いファイルの削除もこのステップで行う
- [ ] **Step 4: 通ることを確かめる** — `npx vitest run tests/components/datasets`

### Task 13: 性能・ドキュメント・全体の確認

**Files:**

- Modify: `tests/analysisPerformance.test.jsx`、`tests/components/datasets/DatasetDetailPage.performance.test.jsx`、`tests/integration/samples-upload.test.jsx`、`tests/samples.test.jsx`（古い UI を使っている所だけ）
- Modify: `docs/05-ui-design.md`、`docs/03-functional-design.md`、`docs/02-architecture.md`

- [ ] **Step 1: 性能のテストを足す・直す**（既存の測り方に合わせる）
  - `25 万行: 列メニューを開いて値の候補を出すまで 0.3 秒未満`
  - `25 万行: ピボット（行 1・列 1・値 1）0.5 秒未満`
  - 既存の基準（フィルタ・並べ替え・グラフ）を、新しい UI の操作で測るように直す
- [ ] **Step 2: 全テスト** — `npx vitest run` → すべて PASS（件数を報告する）
- [ ] **Step 3: ビルド** — `npm run build` → エラーなし
- [ ] **Step 4: 画面の確認** — `npm run dev` を起動し、ブラウザで `samples/sales_2024q1.csv` を使って確かめる: 1280px / 768px / 375px の配置、列メニュー、行・列の非表示、ピボット（マウスでドラッグ・＋ボタン・キーボード）、ピボットグラフ、散布図、ビューの保存と読み込み。スクリーンショットをユーザーに見せる
- [ ] **Step 5: ドキュメントを更新** — docs/05（2・3・4・5・6 章を新しい配置と操作に）、docs/03（7 章の設定の形・処理の順番）、docs/02（技術スタックに @dnd-kit/react）
- [ ] **Step 6: `.scratchpad/` を空にする**
- [ ] **Step 7: ユーザーにコミットするか聞き、承認されたら PR を作る**（日本語のタイトル・本文。マージはしない）
