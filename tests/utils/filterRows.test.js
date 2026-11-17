// @vitest-environment node
// 仕様: docs/03-functional-design.md 2.4
import { describe, it, expect } from "vitest";
import { filterRows, InvalidFilterError } from "../../src/utils/filterRows.js";

const sales = [
  {
    日付: "2024-01-01",
    店舗: "渋谷店",
    商品: "りんご",
    数量: "3",
    売上: "300",
  },
  {
    日付: "2024-01-15",
    店舗: "新宿店",
    商品: "みかん",
    数量: "10",
    売上: "1,200",
  },
  {
    日付: "2024/02/01",
    店舗: "渋谷店",
    商品: "バナナ",
    数量: "5",
    売上: "500",
  },
  { 日付: "2024-03-10", 店舗: "池袋店", 商品: "Apple", 数量: "9", 売上: "900" },
];
const stores = (rows) => rows.map((r) => r.店舗);
const f = (column, op, value) => [{ column, op, value }];

describe("filterRows", () => {
  describe("eq / ne（文字列の完全一致）", () => {
    it("eq は完全一致の行だけ返す", () => {
      expect(stores(filterRows(sales, f("店舗", "eq", "渋谷店")))).toEqual([
        "渋谷店",
        "渋谷店",
      ]);
    });

    it("eq は部分一致では一致しない", () => {
      expect(filterRows(sales, f("店舗", "eq", "渋谷"))).toEqual([]);
    });

    it("ne は一致しない行だけ返す", () => {
      expect(stores(filterRows(sales, f("店舗", "ne", "渋谷店")))).toEqual([
        "新宿店",
        "池袋店",
      ]);
    });

    it('number 列でも eq は文字列比較（"5" と "5.0" は別）', () => {
      const rows = [{ n: "5" }, { n: "5.0" }, { n: "6" }];
      expect(filterRows(rows, f("n", "eq", "5"))).toEqual([{ n: "5" }]);
      expect(filterRows(rows, f("n", "ne", "5"))).toEqual([
        { n: "5.0" },
        { n: "6" },
      ]);
    });

    it('空欄セルは eq/ne では文字列として比較される（eq "" は空欄に一致、ne "x" は空欄を含む）', () => {
      const rows = [{ a: "x" }, { a: "" }, { a: "y" }];
      expect(filterRows(rows, f("a", "eq", ""))).toEqual([{ a: "" }]);
      expect(filterRows(rows, f("a", "ne", "x"))).toEqual([
        { a: "" },
        { a: "y" },
      ]);
    });
  });

  describe("contains", () => {
    it("部分一致する行を返す", () => {
      expect(
        filterRows(sales, f("店舗", "contains", "宿")).map((r) => r.店舗),
      ).toEqual(["新宿店"]);
    });

    it("大文字小文字を区別する", () => {
      expect(filterRows(sales, f("商品", "contains", "Appl"))).toHaveLength(1);
      expect(filterRows(sales, f("商品", "contains", "appl"))).toHaveLength(0);
    });
  });

  describe("gt / gte / lt / lte（number 列）", () => {
    it('gt は数値として比較する（"10" > "9" が真。文字列比較ではない）', () => {
      const result = filterRows(sales, f("数量", "gt", "9"));
      expect(result.map((r) => r.数量)).toEqual(["10"]);
    });

    it("gte は等しい値を含む", () => {
      expect(
        filterRows(sales, f("数量", "gte", "9")).map((r) => r.数量),
      ).toEqual(["10", "9"]);
    });

    it("lt は等しい値を含まない", () => {
      expect(
        filterRows(sales, f("数量", "lt", "5")).map((r) => r.数量),
      ).toEqual(["3"]);
    });

    it("lte は等しい値を含む", () => {
      expect(
        filterRows(sales, f("数量", "lte", "5")).map((r) => r.数量),
      ).toEqual(["3", "5"]);
    });

    it("カンマ付きの値（1,200）も数値として比較する", () => {
      expect(
        filterRows(sales, f("売上", "gt", "1000")).map((r) => r.売上),
      ).toEqual(["1,200"]);
    });

    it('条件値がカンマ付き（"1,000"）でも数値として扱う', () => {
      expect(
        filterRows(sales, f("売上", "gte", "1,000")).map((r) => r.売上),
      ).toEqual(["1,200"]);
    });

    it("負数・小数も比較できる", () => {
      const rows = [{ v: "-1.5" }, { v: "0" }, { v: "2.5" }];
      expect(filterRows(rows, f("v", "lt", "0"))).toEqual([{ v: "-1.5" }]);
      expect(filterRows(rows, f("v", "gt", "-2"))).toHaveLength(3);
    });
  });

  describe("gt / gte / lt / lte（date 列）", () => {
    it("日付として比較する（YYYY/MM/DD と YYYY-MM-DD の混在も正しく比較）", () => {
      const result = filterRows(sales, f("日付", "gte", "2024-01-15"));
      expect(result.map((r) => r.日付)).toEqual([
        "2024-01-15",
        "2024/02/01",
        "2024-03-10",
      ]);
    });

    it("条件値が YYYY/MM/DD 形式でも日付として扱う", () => {
      const result = filterRows(sales, f("日付", "lt", "2024/01/15"));
      expect(result.map((r) => r.日付)).toEqual(["2024-01-01"]);
    });

    it("lte / gt の境界（同じ日付）", () => {
      expect(filterRows(sales, f("日付", "lte", "2024-01-15"))).toHaveLength(2);
      expect(filterRows(sales, f("日付", "gt", "2024-03-10"))).toHaveLength(0);
    });
  });

  describe("空欄セル", () => {
    const rows = [{ n: "1" }, { n: "" }, { n: "5" }];

    it("空欄は gt / gte / lt / lte のどれにも一致しない", () => {
      expect(filterRows(rows, f("n", "gt", "0"))).toEqual([
        { n: "1" },
        { n: "5" },
      ]);
      expect(filterRows(rows, f("n", "gte", "0"))).toEqual([
        { n: "1" },
        { n: "5" },
      ]);
      expect(filterRows(rows, f("n", "lt", "100"))).toEqual([
        { n: "1" },
        { n: "5" },
      ]);
      expect(filterRows(rows, f("n", "lte", "100"))).toEqual([
        { n: "1" },
        { n: "5" },
      ]);
    });

    it("空欄は 0 以下の条件にも一致しない（0 として扱わない）", () => {
      expect(filterRows(rows, f("n", "lte", "0"))).toEqual([]);
      expect(filterRows(rows, f("n", "lt", "1"))).toEqual([]);
    });
  });

  describe("複数条件（AND）", () => {
    it("すべての条件を満たす行だけ返す", () => {
      const result = filterRows(sales, [
        { column: "店舗", op: "eq", value: "渋谷店" },
        { column: "数量", op: "gt", value: "3" },
      ]);
      expect(result).toEqual([sales[2]]);
    });

    it("同じ列に 2 条件（範囲指定）も AND", () => {
      const result = filterRows(sales, [
        { column: "数量", op: "gte", value: "5" },
        { column: "数量", op: "lte", value: "9" },
      ]);
      expect(result.map((r) => r.数量)).toEqual(["5", "9"]);
    });

    it("一致する行がなければ []", () => {
      const result = filterRows(sales, [
        { column: "店舗", op: "eq", value: "渋谷店" },
        { column: "店舗", op: "eq", value: "新宿店" },
      ]);
      expect(result).toEqual([]);
    });
  });

  describe("空条件・空データ", () => {
    it("条件が空配列なら全件返す", () => {
      expect(filterRows(sales, [])).toEqual(sales);
    });

    it("rows が空なら []（条件があってもエラーにしない）", () => {
      expect(filterRows([], f("店舗", "eq", "渋谷店"))).toEqual([]);
    });

    it("rows が空なら、存在しない列の条件でもエラーにせず []", () => {
      expect(filterRows([], f("存在しない列", "eq", "x"))).toEqual([]);
    });

    it("rows も条件も空なら []", () => {
      expect(filterRows([], [])).toEqual([]);
    });
  });

  describe("元の配列を変更しない", () => {
    it("rows は変更されない", () => {
      const before = structuredClone(sales);
      filterRows(sales, f("店舗", "eq", "渋谷店"));
      expect(sales).toEqual(before);
    });

    it("条件が空でも、返す配列は元の配列を壊さない", () => {
      const before = structuredClone(sales);
      const result = filterRows(sales, []);
      result.pop();
      expect(sales).toEqual(before);
    });
  });

  describe("列の型の推定（渡された rows から内部で推定）", () => {
    it("渡された rows の中で数値列なら gt が使える（絞り込み済みの rows でも）", () => {
      const subset = [{ v: "1" }, { v: "20" }];
      expect(filterRows(subset, f("v", "gt", "5"))).toEqual([{ v: "20" }]);
    });

    it("渡された rows に数値でない値が 1 件でもあれば string 列なので gt は InvalidFilterError", () => {
      const rows = [{ v: "1" }, { v: "20" }, { v: "abc" }];
      expect(() => filterRows(rows, f("v", "gt", "5"))).toThrow(
        InvalidFilterError,
      );
    });
  });

  describe("InvalidFilterError", () => {
    it("InvalidFilterError は Error を継承する", () => {
      expect(new InvalidFilterError("x")).toBeInstanceOf(Error);
    });

    it("存在しない列は無視せず InvalidFilterError", () => {
      expect(() => filterRows(sales, f("存在しない列", "eq", "x"))).toThrow(
        InvalidFilterError,
      );
    });

    it("存在しない列は、他の条件が正しくても InvalidFilterError", () => {
      const filters = [
        { column: "店舗", op: "eq", value: "渋谷店" },
        { column: "存在しない列", op: "contains", value: "x" },
      ];
      expect(() => filterRows(sales, filters)).toThrow(InvalidFilterError);
    });

    it("gt 系を string 列に使うと InvalidFilterError", () => {
      for (const op of ["gt", "gte", "lt", "lte"]) {
        expect(() => filterRows(sales, f("店舗", op, "渋谷店"))).toThrow(
          InvalidFilterError,
        );
      }
    });

    it("未対応の op は InvalidFilterError", () => {
      expect(() => filterRows(sales, f("店舗", "startsWith", "渋"))).toThrow(
        InvalidFilterError,
      );
    });

    it("number 列の gt で、条件値が数値として解釈できないと InvalidFilterError", () => {
      expect(() => filterRows(sales, f("売上", "gt", "abc"))).toThrow(
        InvalidFilterError,
      );
    });

    it("date 列の gt で、条件値が日付として解釈できないと InvalidFilterError", () => {
      expect(() => filterRows(sales, f("日付", "gt", "abc"))).toThrow(
        InvalidFilterError,
      );
      expect(() => filterRows(sales, f("日付", "gt", "100"))).toThrow(
        InvalidFilterError,
      );
    });
  });
});

describe("filterRows: in / notIn（値から選ぶ）", () => {
  const fv = (column, op, values) => [{ column, op, values }];

  it("in: values に含まれる行だけ残す", () => {
    expect(
      stores(filterRows(sales, fv("店舗", "in", ["渋谷店", "池袋店"]))),
    ).toEqual(["渋谷店", "渋谷店", "池袋店"]);
  });

  it('in: 空欄 "" を選べる', () => {
    const rows = [...sales, { ...sales[0], 店舗: "" }];
    expect(filterRows(rows, fv("店舗", "in", [""]))).toHaveLength(1);
  });

  it("notIn: values に含まれる行を除く", () => {
    expect(stores(filterRows(sales, fv("店舗", "notIn", ["渋谷店"])))).toEqual(
      ["新宿店", "池袋店"],
    );
  });

  it("in: ほかの条件と AND になる", () => {
    const filters = [
      { column: "店舗", op: "in", values: ["渋谷店", "池袋店"] },
      { column: "売上", op: "gte", value: "500" },
    ];
    expect(stores(filterRows(sales, filters))).toEqual(["渋谷店", "池袋店"]);
  });

  it("in: 存在しない列は InvalidFilterError", () => {
    expect(() => filterRows(sales, fv("地域", "in", ["東"]))).toThrow(
      InvalidFilterError,
    );
  });
});
