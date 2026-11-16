// @vitest-environment node
// 仕様: docs/03-functional-design.md 2.6（Phase 2 確定・実装時の決定を含む）
import { describe, it, expect } from "vitest";
import { aggregate } from "../../src/utils/aggregate.js";
import { filterRows } from "../../src/utils/filterRows.js";

const sales = [
  { 店舗: "渋谷店", 商品: "りんご", 数量: "3", 売上: "300" },
  { 店舗: "新宿店", 商品: "りんご", 数量: "5", 売上: "500" },
  { 店舗: "渋谷店", 商品: "みかん", 数量: "2", 売上: "1,200" },
  { 店舗: "渋谷店", 商品: "りんご", 数量: "4", 売上: "400" },
  { 店舗: "新宿店", 商品: "みかん", 数量: "", 売上: "" },
];
const m = (column, fn) => ({ column, fn });

describe("aggregate", () => {
  describe("単一キーのグループ化", () => {
    it("sum: 出力列名は <column>_<fn>", () => {
      const result = aggregate(sales, {
        groupBy: ["店舗"],
        metrics: [m("数量", "sum")],
      });
      expect(result).toEqual([
        { 店舗: "渋谷店", 数量_sum: 9 },
        { 店舗: "新宿店", 数量_sum: 5 },
      ]);
    });

    it("avg / min / max", () => {
      const result = aggregate(sales, {
        groupBy: ["店舗"],
        metrics: [m("数量", "avg"), m("数量", "min"), m("数量", "max")],
      });
      expect(result).toEqual([
        { 店舗: "渋谷店", 数量_avg: 3, 数量_min: 2, 数量_max: 4 },
        { 店舗: "新宿店", 数量_avg: 5, 数量_min: 5, 数量_max: 5 },
      ]);
    });

    it("count: 出力列名は count（column 省略可）で、グループの行数", () => {
      const result = aggregate(sales, {
        groupBy: ["店舗"],
        metrics: [{ fn: "count" }],
      });
      expect(result).toEqual([
        { 店舗: "渋谷店", count: 3 },
        { 店舗: "新宿店", count: 2 },
      ]);
    });

    it("count に column を指定しても、出力列名は count", () => {
      const result = aggregate(sales, {
        groupBy: ["店舗"],
        metrics: [m("売上", "count")],
      });
      expect(result).toEqual([
        { 店舗: "渋谷店", count: 3 },
        { 店舗: "新宿店", count: 2 },
      ]);
    });

    it("複数の指標を同時に出せる（列順は groupBy → metrics の順）", () => {
      const result = aggregate(sales, {
        groupBy: ["店舗"],
        metrics: [m("売上", "sum"), { fn: "count" }, m("数量", "max")],
      });
      expect(Object.keys(result[0])).toEqual([
        "店舗",
        "売上_sum",
        "count",
        "数量_max",
      ]);
      expect(result[0]).toEqual({
        店舗: "渋谷店",
        売上_sum: 1900,
        count: 3,
        数量_max: 4,
      });
    });

    it("同じ列に複数の fn を指定できる", () => {
      const result = aggregate(sales, {
        groupBy: ["商品"],
        metrics: [m("売上", "sum"), m("売上", "avg")],
      });
      expect(result).toEqual([
        { 商品: "りんご", 売上_sum: 1200, 売上_avg: 400 },
        { 商品: "みかん", 売上_sum: 1200, 売上_avg: 1200 },
      ]);
    });
  });

  describe("複数キーのグループ化", () => {
    it("キーの組み合わせごとに集計する", () => {
      const result = aggregate(sales, {
        groupBy: ["店舗", "商品"],
        metrics: [m("数量", "sum")],
      });
      expect(result).toEqual([
        { 店舗: "渋谷店", 商品: "りんご", 数量_sum: 7 },
        { 店舗: "新宿店", 商品: "りんご", 数量_sum: 5 },
        { 店舗: "渋谷店", 商品: "みかん", 数量_sum: 2 },
        { 店舗: "新宿店", 商品: "みかん", 数量_sum: 0 },
      ]);
    });

    it('キーの連結が同じになる別の組み合わせ（"a","bc" と "ab","c"）を混ぜない', () => {
      const rows = [
        { k1: "a", k2: "bc", v: "1" },
        { k1: "ab", k2: "c", v: "2" },
      ];
      const result = aggregate(rows, {
        groupBy: ["k1", "k2"],
        metrics: [m("v", "sum")],
      });
      expect(result).toEqual([
        { k1: "a", k2: "bc", v_sum: 1 },
        { k1: "ab", k2: "c", v_sum: 2 },
      ]);
    });
  });

  describe("グループの出力順", () => {
    it("各グループが最初に現れた順（キーの昇順などに並べ替えない）", () => {
      const rows = [
        { k: "c", v: "1" },
        { k: "a", v: "1" },
        { k: "b", v: "1" },
        { k: "a", v: "1" },
      ];
      const result = aggregate(rows, {
        groupBy: ["k"],
        metrics: [{ fn: "count" }],
      });
      expect(result.map((r) => r.k)).toEqual(["c", "a", "b"]);
    });
  });

  describe("groupBy が空", () => {
    it("全体を 1 行に集計する", () => {
      const result = aggregate(sales, {
        groupBy: [],
        metrics: [m("売上", "sum"), m("数量", "max"), { fn: "count" }],
      });
      expect(result).toEqual([{ 売上_sum: 2400, 数量_max: 5, count: 5 }]);
    });

    it("rows が空なら groupBy が空でも []", () => {
      expect(
        aggregate([], { groupBy: [], metrics: [m("売上", "sum")] }),
      ).toEqual([]);
      expect(
        aggregate([], { groupBy: ["店舗"], metrics: [m("売上", "sum")] }),
      ).toEqual([]);
    });
  });

  describe("非数値・空欄の扱い", () => {
    it("空欄は sum/avg/min/max から除外される（avg の分母にも入れない）", () => {
      const rows = [{ v: "10" }, { v: "" }, { v: "20" }];
      const result = aggregate(rows, {
        groupBy: [],
        metrics: [m("v", "sum"), m("v", "avg"), m("v", "min"), m("v", "max")],
      });
      expect(result).toEqual([{ v_sum: 30, v_avg: 15, v_min: 10, v_max: 20 }]);
    });

    it('数値でない文字列（"abc"）も除外される', () => {
      const rows = [{ v: "10" }, { v: "abc" }, { v: "20" }];
      const result = aggregate(rows, {
        groupBy: [],
        metrics: [m("v", "sum"), m("v", "avg")],
      });
      expect(result).toEqual([{ v_sum: 30, v_avg: 15 }]);
    });

    it("カンマ付きの数字（1,200）も数値として合計する", () => {
      const rows = [{ v: "1,200" }, { v: "300" }];
      expect(
        aggregate(rows, { groupBy: [], metrics: [m("v", "sum")] }),
      ).toEqual([{ v_sum: 1500 }]);
    });

    it('min / max は数値として比較する（"9" と "10"）', () => {
      const rows = [{ v: "9" }, { v: "10" }, { v: "-3" }];
      const result = aggregate(rows, {
        groupBy: [],
        metrics: [m("v", "min"), m("v", "max")],
      });
      expect(result).toEqual([{ v_min: -3, v_max: 10 }]);
    });

    it("count は空欄・非数値の行も数える", () => {
      const rows = [{ v: "10" }, { v: "" }, { v: "abc" }];
      expect(
        aggregate(rows, { groupBy: [], metrics: [{ fn: "count" }] }),
      ).toEqual([{ count: 3 }]);
    });

    it("グループ内に有効な数値が 0 件のとき、sum は 0、avg / min / max は null", () => {
      const rows = [
        { k: "a", v: "" },
        { k: "a", v: "abc" },
        { k: "b", v: "5" },
      ];
      const result = aggregate(rows, {
        groupBy: ["k"],
        metrics: [
          m("v", "sum"),
          m("v", "avg"),
          m("v", "min"),
          m("v", "max"),
          { fn: "count" },
        ],
      });
      expect(result[0]).toEqual({
        k: "a",
        v_sum: 0,
        v_avg: null,
        v_min: null,
        v_max: null,
        count: 2,
      });
      expect(result[1]).toEqual({
        k: "b",
        v_sum: 5,
        v_avg: 5,
        v_min: 5,
        v_max: 5,
        count: 1,
      });
    });

    it("空欄のグループキーは空文字のグループとして集計する", () => {
      const rows = [
        { k: "", v: "1" },
        { k: "a", v: "2" },
        { k: "", v: "3" },
      ];
      const result = aggregate(rows, {
        groupBy: ["k"],
        metrics: [m("v", "sum")],
      });
      expect(result).toEqual([
        { k: "", v_sum: 4 },
        { k: "a", v_sum: 2 },
      ]);
    });

    it("小数の合計・平均（浮動小数の誤差は許容）", () => {
      const rows = [{ v: "0.1" }, { v: "0.2" }, { v: "0.3" }];
      const [r] = aggregate(rows, {
        groupBy: [],
        metrics: [m("v", "sum"), m("v", "avg")],
      });
      expect(r.v_sum).toBeCloseTo(0.6, 10);
      expect(r.v_avg).toBeCloseTo(0.2, 10);
    });

    it("値は文字列ではなく number で返す", () => {
      const [r] = aggregate(sales, {
        groupBy: [],
        metrics: [m("売上", "sum"), { fn: "count" }],
      });
      expect(typeof r.売上_sum).toBe("number");
      expect(typeof r.count).toBe("number");
    });
  });

  describe("合計行の扱い（呼び出し側で filterRows の ne で除く）", () => {
    const excelLike = [
      { 店舗: "渋谷店", 商品: "りんご", "1月": "100", "2月": "200" },
      { 店舗: "新宿店", 商品: "りんご", "1月": "50", "2月": "60" },
      { 店舗: "合計", 商品: "", "1月": "150", "2月": "260" },
    ];

    it("集計関数は合計行を判別しない（含めると合計が 2 倍になる）", () => {
      const [r] = aggregate(excelLike, {
        groupBy: [],
        metrics: [m("1月", "sum")],
      });
      expect(r["1月_sum"]).toBe(300);
    });

    it("filterRows の ne で合計行を除いてから渡せば、正しい合計になる", () => {
      const body = filterRows(excelLike, [
        { column: "店舗", op: "ne", value: "合計" },
      ]);
      const [r] = aggregate(body, {
        groupBy: [],
        metrics: [m("1月", "sum"), m("2月", "sum")],
      });
      expect(r).toEqual({ "1月_sum": 150, "2月_sum": 260 });
    });
  });

  describe("存在しない列", () => {
    it("metrics の列が存在しなければ、全セル空欄として扱う（sum は 0、avg は null）", () => {
      const [r] = aggregate(sales, {
        groupBy: [],
        metrics: [m("ない列", "sum"), m("ない列", "avg"), { fn: "count" }],
      });
      expect(r).toEqual({ ない列_sum: 0, ない列_avg: null, count: 5 });
    });

    it("groupBy の列が存在しなければ、キーは空文字の 1 グループになる", () => {
      const result = aggregate(sales, {
        groupBy: ["ない列"],
        metrics: [{ fn: "count" }],
      });
      expect(result).toEqual([{ ない列: "", count: 5 }]);
    });
  });

  describe("異常系", () => {
    it("不正な fn は RangeError", () => {
      expect(() =>
        aggregate(sales, { groupBy: [], metrics: [m("売上", "median")] }),
      ).toThrow(RangeError);
    });
  });

  describe("元の rows を変更しない", () => {
    it("rows は変更されない", () => {
      const before = structuredClone(sales);
      aggregate(sales, { groupBy: ["店舗"], metrics: [m("売上", "sum")] });
      expect(sales).toEqual(before);
    });
  });
});
