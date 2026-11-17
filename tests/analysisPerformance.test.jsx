// @vitest-environment node
// 仕様: docs/03-functional-design.md 2.8 末尾（Phase 2 計測: 50,000 行で各処理 40ms 級）／
//       docs/01-requirements.md 4 章（フィルタ・集計が体感 2 秒以内）
// 閾値は計測値（約 40ms）に対して緩め（マシン差・CI での揺れを吸収する）。
import { describe, it, expect, beforeAll } from "vitest";
import { filterRows } from "../src/utils/filterRows.js";
import { sortRows } from "../src/utils/sortRows.js";
import { aggregate } from "../src/utils/aggregate.js";
import { statistics } from "../src/utils/statistics.js";
import { correlation } from "../src/utils/correlation.js";
import { pivot } from "../src/utils/pivot.js";
import { countValues } from "../src/utils/valueSelection.js";
import { excludeHiddenRows } from "../src/utils/hiddenRows.js";

const ROW_COUNT = 50_000;
const LIMIT_MS = 500; // 各処理の上限（目安は 40ms 級）
const STRING_SORT_LIMIT_MS = 1000; // 日本語ロケール比較は数値より重いので少し緩める

const STORES = ["渋谷店", "新宿店", "池袋店", "銀座店"];
const PRODUCTS = ["りんご", "みかん", "バナナ"];

// 乱数の種を固定した疑似乱数（毎回同じデータにする）
function makeRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function buildRows(count) {
  const rand = makeRandom(20240101);
  const rows = [];
  for (let i = 0; i < count; i++) {
    const day = (i % 365) + 1;
    const month = String(((day - 1) % 12) + 1).padStart(2, "0");
    const date = `2024-${month}-${String((day % 28) + 1).padStart(2, "0")}`;
    const quantity = Math.floor(rand() * 20) + 1;
    const price = (Math.floor(rand() * 9) + 1) * 100;
    rows.push({
      日付: date,
      店舗: STORES[Math.floor(rand() * STORES.length)],
      商品: PRODUCTS[Math.floor(rand() * PRODUCTS.length)],
      数量: i % 50 === 0 ? "" : String(quantity), // 一部は欠損
      単価: String(price),
      売上: String(quantity * price),
    });
  }
  return rows;
}

// 1 回ウォームアップしてから、1 回の実行時間（ms）を返す
function measure(fn) {
  fn();
  const start = performance.now();
  const result = fn();
  return { ms: performance.now() - start, result };
}

let rows;

beforeAll(() => {
  rows = buildRows(ROW_COUNT);
});

describe(`分析ロジックの性能（${ROW_COUNT.toLocaleString()} 行）`, () => {
  it("テストデータは 50,000 行", () => {
    expect(rows).toHaveLength(ROW_COUNT);
  });

  it(`filterRows: 複数条件で ${LIMIT_MS}ms 以内`, () => {
    const filters = [
      { column: "店舗", op: "eq", value: "渋谷店" },
      { column: "売上", op: "gte", value: "1000" },
      { column: "日付", op: "lt", value: "2024-07-01" },
    ];
    const { ms, result } = measure(() => filterRows(rows, filters));
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(ROW_COUNT);
    expect(result.every((r) => r.店舗 === "渋谷店")).toBe(true);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it(`sortRows: 数値列の降順で ${LIMIT_MS}ms 以内`, () => {
    const { ms, result } = measure(() =>
      sortRows(rows, { column: "売上", direction: "desc" }, "number"),
    );
    expect(result).toHaveLength(ROW_COUNT);
    expect(Number(result[0].売上)).toBeGreaterThanOrEqual(
      Number(result[1].売上),
    );
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it(`sortRows: 日付列の昇順で ${LIMIT_MS}ms 以内`, () => {
    const { ms, result } = measure(() =>
      sortRows(rows, { column: "日付", direction: "asc" }, "date"),
    );
    expect(result).toHaveLength(ROW_COUNT);
    expect(result[0].日付 <= result[ROW_COUNT - 1].日付).toBe(true);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it(`sortRows: 文字列列（日本語）の昇順で ${STRING_SORT_LIMIT_MS}ms 以内`, () => {
    const { ms, result } = measure(() =>
      sortRows(rows, { column: "商品", direction: "asc" }, "string"),
    );
    expect(result).toHaveLength(ROW_COUNT);
    expect(result[0].商品).toBe("バナナ"); // 日本語ロケール順の先頭（バ < み < り）
    expect(ms).toBeLessThan(STRING_SORT_LIMIT_MS);
  });

  it(`aggregate: 店舗×商品の 2 キー・複数指標で ${LIMIT_MS}ms 以内`, () => {
    const spec = {
      groupBy: ["店舗", "商品"],
      metrics: [
        { column: "売上", fn: "sum" },
        { column: "数量", fn: "avg" },
        { column: "売上", fn: "max" },
        { fn: "count" },
      ],
    };
    const { ms, result } = measure(() => aggregate(rows, spec));
    expect(result).toHaveLength(STORES.length * PRODUCTS.length);
    expect(result.reduce((sum, r) => sum + r.count, 0)).toBe(ROW_COUNT);
    const total = rows.reduce((sum, r) => sum + Number(r.売上), 0);
    expect(result.reduce((sum, r) => sum + r.売上_sum, 0)).toBe(total);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it(`aggregate: groupBy 空（全体 1 行）で ${LIMIT_MS}ms 以内`, () => {
    const { ms, result } = measure(() =>
      aggregate(rows, {
        groupBy: [],
        metrics: [{ column: "売上", fn: "sum" }, { fn: "count" }],
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(ROW_COUNT);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it(`statistics: 欠損を含む数値列で ${LIMIT_MS}ms 以内`, () => {
    const values = rows.map((r) => r.数量);
    const { ms, result } = measure(() => statistics(values));
    expect(result.missing).toBe(ROW_COUNT / 50);
    expect(result.count + result.missing).toBe(ROW_COUNT);
    expect(result.min).toBeGreaterThanOrEqual(1);
    expect(result.max).toBeLessThanOrEqual(20);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it(`correlation: 3 列（数量・単価・売上）で ${LIMIT_MS}ms 以内`, () => {
    const columns = ["数量", "単価", "売上"].map((name) =>
      rows.map((r) => r[name]),
    );
    const { ms, result } = measure(() => correlation(columns));
    expect(result).toHaveLength(3);
    result.forEach((row, i) => expect(row[i]).toBe(1));
    // 売上 = 数量 × 単価 なので、売上は数量・単価と正の相関
    expect(result[0][2]).toBeGreaterThan(0);
    expect(result[1][2]).toBeGreaterThan(0);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it(`pivot: 行 2・列 1〈日付〉・値 2 で ${LIMIT_MS}ms 以内（列は 50 で切る）`, () => {
    const spec = {
      rows: ["店舗", "商品"],
      columns: ["日付"],
      values: [
        { column: "売上", fn: "sum" },
        { column: "数量", fn: "avg" },
      ],
    };
    const { ms, result } = measure(() =>
      pivot(rows, spec, (name) =>
        name === "日付"
          ? "date"
          : ["数量", "単価", "売上"].includes(name)
            ? "number"
            : "string",
      ),
    );
    expect(result.columnKeys).toHaveLength(50);
    expect(result.records).toHaveLength(STORES.length * PRODUCTS.length);
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it("一連の処理（フィルタ → 並べ替え → 集計 → 統計 → 相関）を通しても 2 秒以内", () => {
    const start = performance.now();
    const filtered = filterRows(rows, [
      { column: "店舗", op: "ne", value: "銀座店" },
    ]);
    const sorted = sortRows(
      filtered,
      { column: "売上", direction: "desc" },
      "number",
    );
    aggregate(sorted, {
      groupBy: ["商品"],
      metrics: [{ column: "売上", fn: "sum" }],
    });
    statistics(sorted.map((r) => r.売上));
    correlation(
      ["数量", "単価", "売上"].map((name) => sorted.map((r) => r[name])),
    );
    expect(performance.now() - start).toBeLessThan(2000);
  });
});

// 分析画面の改修（docs/superpowers/specs/2026-11-16-analysis-page-redesign-design.md 3 章）:
// 10MB・約 25 万行で、操作のたびに 1 秒以上固まらないこと。目安: 集計 0.1〜0.5 秒、値の候補 0.3 秒
const BIG_ROW_COUNT = 250_000;
const TYPES = {
  日付: "date",
  店舗: "string",
  商品: "string",
  数量: "number",
  単価: "number",
  売上: "number",
};
const typeOf = (name) => TYPES[name] ?? "string";

describe(`分析画面の改修の性能（${BIG_ROW_COUNT.toLocaleString()} 行）`, () => {
  let big;
  beforeAll(() => {
    big = buildRows(BIG_ROW_COUNT);
  });

  it("ピボット（行 1・列 1・値 1）が 1,000ms 以内（単独では約 0.1 秒。全テストを並べて実行すると数倍に揺れる）", () => {
    const spec = {
      rows: ["店舗"],
      columns: ["商品"],
      values: [{ column: "売上", fn: "sum" }],
    };
    const { ms, result } = measure(() => pivot(big, spec, typeOf));
    expect(result.records).toHaveLength(STORES.length);
    expect(result.columnKeys).toHaveLength(PRODUCTS.length);
    expect(ms).toBeLessThan(1000);
  });

  it("列見出しのメニューの値の候補（日付列: 84 種類）を数えるのが 300ms 以内", () => {
    const { ms, result } = measure(() => countValues(big, "日付"));
    expect(result).toHaveLength(84);
    expect(ms).toBeLessThan(300);
  });

  it("行の非表示（1,000 行）→ 値から選ぶ（notIn）の絞り込みが 300ms 以内", () => {
    const hidden = Array.from({ length: 1000 }, (_, i) => i * 250);
    const { ms, result } = measure(() =>
      filterRows(excludeHiddenRows(big, hidden), [
        { column: "店舗", op: "notIn", values: ["渋谷店"] },
      ]),
    );
    expect(result.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(300);
  });
});
