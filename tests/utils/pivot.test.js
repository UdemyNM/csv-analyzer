// @vitest-environment node
// 仕様: docs/superpowers/specs/2026-11-16-analysis-page-redesign-design.md 7.2 / 8.2
import { describe, it, expect } from "vitest";
import {
  pivot,
  pivotSeries,
  valueLabel,
  keyLabel,
  FN_LABELS,
  COLUMN_KEY_LIMIT,
} from "../../src/utils/pivot.js";

const SALES = [
  {
    店舗: "東京",
    商品: "りんご",
    数量: "10",
    売上: "1000",
    日付: "2024-01-01",
  },
  { 店舗: "東京", 商品: "みかん", 数量: "5", 売上: "500", 日付: "2024-01-02" },
  {
    店舗: "大阪",
    商品: "りんご",
    数量: "20",
    売上: "2000",
    日付: "2024-01-03",
  },
  {
    店舗: "大阪",
    商品: "みかん",
    数量: "15",
    売上: "1,500",
    日付: "2024-01-04",
  },
  {
    店舗: "名古屋",
    商品: "りんご",
    数量: "8",
    売上: "800",
    日付: "2024-01-05",
  },
];
const TYPES = {
  店舗: "string",
  商品: "string",
  数量: "number",
  売上: "number",
  日付: "date",
};
const typeOf = (name) => TYPES[name] ?? "string";
const sum = (column) => ({ column, fn: "sum" });
const spec = (rows, columns, values) => ({ rows, columns, values });

describe("pivot: 行だけ", () => {
  it("店舗ごとの売上合計（最初に現れた順。カンマ付きも数値）", () => {
    const r = pivot(SALES, spec(["店舗"], [], [sum("売上")]), typeOf);
    expect(r.columnKeys).toEqual([[]]);
    expect(r.records).toEqual([
      { rowKey: ["東京"], cells: [1500] },
      { rowKey: ["大阪"], cells: [3500] },
      { rowKey: ["名古屋"], cells: [800] },
    ]);
  });

  it("複数キーの組み合わせごとに集計する", () => {
    const r = pivot(SALES, spec(["店舗", "商品"], [], [sum("売上")]), typeOf);
    expect(r.records.map((x) => x.rowKey)).toEqual([
      ["東京", "りんご"],
      ["東京", "みかん"],
      ["大阪", "りんご"],
      ["大阪", "みかん"],
      ["名古屋", "りんご"],
    ]);
  });
});

describe("pivot: 行＋列", () => {
  it("店舗 × 商品。列キーは昇順、無い組み合わせは null", () => {
    const r = pivot(SALES, spec(["店舗"], ["商品"], [sum("売上")]), typeOf);
    expect(r.columnKeys).toEqual([["みかん"], ["りんご"]]);
    expect(r.records[0]).toEqual({ rowKey: ["東京"], cells: [500, 1000] });
    expect(r.records[2]).toEqual({ rowKey: ["名古屋"], cells: [null, 800] });
  });

  it("cells は 列キー c・値 v を c * values.length + v に置く", () => {
    const r = pivot(
      SALES,
      spec(["店舗"], ["商品"], [sum("売上"), { fn: "count" }]),
      typeOf,
    );
    // 東京: みかん(500, 1件) りんご(1000, 1件)
    expect(r.records[0].cells).toEqual([500, 1, 1000, 1]);
  });

  it("列を 2 つ置くと、左の列から入れ子で昇順", () => {
    const rows = [
      { a: "b", b: "y" },
      { a: "a", b: "z" },
      { a: "b", b: "x" },
      { a: "a", b: "y" },
    ];
    const r = pivot(
      rows,
      spec([], ["a", "b"], [{ fn: "count" }]),
      () => "string",
    );
    expect(r.columnKeys).toEqual([
      ["a", "y"],
      ["a", "z"],
      ["b", "x"],
      ["b", "y"],
    ]);
  });
});

describe("pivot: 値だけ・値なし", () => {
  it("行も列も空なら全体を 1 行", () => {
    const r = pivot(SALES, spec([], [], [sum("売上")]), typeOf);
    expect(r.records).toEqual([{ rowKey: [], cells: [5800] }]);
  });

  it("値が空なら null", () => {
    expect(pivot(SALES, spec(["店舗"], [], []), typeOf)).toBeNull();
    expect(pivot(SALES, null, typeOf)).toBeNull();
  });

  it("rows が空でも、値があれば records は []", () => {
    expect(
      pivot([], spec(["店舗"], [], [sum("売上")]), typeOf).records,
    ).toEqual([]);
  });
});

describe("pivot: 列キーの並び", () => {
  it("数値の列は数として昇順（9 → 10）、空欄は最後", () => {
    const rows = [{ n: "10" }, { n: "" }, { n: "9" }];
    const r = pivot(rows, spec([], ["n"], [{ fn: "count" }]), () => "number");
    expect(r.columnKeys).toEqual([["9"], ["10"], [""]]);
  });

  it("日付の列は日付として昇順（文字列なら逆になる 2024/01/20 と 2024-02-01）", () => {
    const rows = [{ d: "2024-02-01" }, { d: "2024/01/20" }];
    const r = pivot(rows, spec([], ["d"], [{ fn: "count" }]), () => "date");
    expect(r.columnKeys).toEqual([["2024/01/20"], ["2024-02-01"]]);
  });

  it(`列キーが ${COLUMN_KEY_LIMIT} を超えたら切り、columnKeyTotal は全数`, () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      k: `k${String(i).padStart(2, "0")}`,
    }));
    const r = pivot(rows, spec([], ["k"], [{ fn: "count" }]), () => "string");
    expect(r.columnKeys).toHaveLength(50);
    expect(r.columnKeyTotal).toBe(60);
    expect(r.records[0].cells).toHaveLength(50);
  });
});

describe("pivot: 集計関数", () => {
  it("sum / avg / count / min / max を 1 回で", () => {
    const fns = ["sum", "avg", "count", "min", "max"];
    const r = pivot(
      SALES,
      spec(
        [],
        [],
        fns.map((fn) => ({ column: "数量", fn })),
      ),
      typeOf,
    );
    expect(r.records[0].cells).toEqual([58, 11.6, 5, 5, 20]);
  });

  it("数値でない列の count は行数", () => {
    const r = pivot(
      SALES,
      spec([], [], [{ column: "店舗", fn: "count" }]),
      typeOf,
    );
    expect(r.records[0].cells).toEqual([5]);
  });

  it("有効な数値が 0 件なら sum は 0、avg / min / max は null", () => {
    const rows = [
      { g: "a", v: "" },
      { g: "a", v: "abc" },
    ];
    const fns = ["sum", "avg", "min", "max"];
    const r = pivot(
      rows,
      spec(
        ["g"],
        [],
        fns.map((fn) => ({ column: "v", fn })),
      ),
      () => "number",
    );
    expect(r.records[0].cells).toEqual([0, null, null, null]);
  });

  it("不正な fn は RangeError", () => {
    expect(() =>
      pivot(SALES, spec([], [], [{ column: "売上", fn: "median" }]), typeOf),
    ).toThrow(RangeError);
  });

  it("元の rows を変更しない", () => {
    const copy = structuredClone(SALES);
    pivot(SALES, spec(["店舗"], ["商品"], [sum("売上")]), typeOf);
    expect(SALES).toEqual(copy);
  });
});

describe("pivot: キーの扱い（Review Focus 2・3）", () => {
  it('"a / b" の 1 列キーと "a","b" の 2 列キーを区別する', () => {
    const rows = [
      { x: "a / b", y: "" },
      { x: "a", y: "b" },
    ];
    const r = pivot(
      rows,
      spec(["x", "y"], [], [{ fn: "count" }]),
      () => "string",
    );
    expect(r.records).toHaveLength(2);
  });

  it('空欄のキーは "" で持ち、keyLabel は「（空欄）」', () => {
    const rows = [{ g: "" }, { g: "a" }];
    const r = pivot(rows, spec(["g"], [], [{ fn: "count" }]), () => "string");
    expect(r.records[0].rowKey).toEqual([""]);
    expect(keyLabel([""])).toBe("（空欄）");
    expect(keyLabel(["新宿店", "りんご"])).toBe("新宿店 / りんご");
  });
});

describe("valueLabel / FN_LABELS", () => {
  it("column なしの count は「件数」、ほかは「列・関数名」", () => {
    expect(valueLabel({ fn: "count" })).toBe("件数");
    expect(valueLabel({ column: "売上", fn: "sum" })).toBe("売上・合計");
    expect(valueLabel({ column: "店舗", fn: "count" })).toBe("店舗・件数");
    expect(FN_LABELS).toEqual({
      sum: "合計",
      avg: "平均",
      count: "件数",
      min: "最小",
      max: "最大",
    });
  });
});

describe("pivotSeries", () => {
  it("列なし・値 2 つ → 系列名は値の表示名", () => {
    const r = pivot(
      SALES,
      spec(["店舗"], [], [sum("売上"), sum("数量")]),
      typeOf,
    );
    const s = pivotSeries(r);
    expect(s.series).toEqual([
      { key: "s0", name: "売上・合計" },
      { key: "s1", name: "数量・合計" },
    ]);
    expect(s.data[0]).toEqual({ x: "東京", s0: 1500, s1: 15 });
  });

  it("値 1 つ・列あり → 系列名は列キー", () => {
    const r = pivot(SALES, spec(["店舗"], ["商品"], [sum("売上")]), typeOf);
    expect(pivotSeries(r).series.map((s) => s.name)).toEqual([
      "みかん",
      "りんご",
    ]);
  });

  it("列も値も 2 つ以上 → 「列キー / 値の表示名」", () => {
    const r = pivot(
      SALES,
      spec(["店舗"], ["商品"], [sum("売上"), sum("数量")]),
      typeOf,
    );
    expect(pivotSeries(r).series[0].name).toBe("みかん / 売上・合計");
  });

  it("系列が 8 を超えたら 8 で切り、seriesTotal は全数", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ g: "x", k: `k${i}` }));
    const r = pivot(
      rows,
      spec(["g"], ["k"], [{ fn: "count" }]),
      () => "string",
    );
    const s = pivotSeries(r);
    expect(s.series).toHaveLength(8);
    expect(s.seriesTotal).toBe(10);
    expect(Object.keys(s.data[0])).toHaveLength(9); // x + 8 系列
  });

  it("X のラベルは keyLabel（行が空なら「全体」）", () => {
    const r = pivot(SALES, spec([], [], [sum("売上")]), typeOf);
    expect(pivotSeries(r).data).toEqual([{ x: "全体", s0: 5800 }]);
  });
});
