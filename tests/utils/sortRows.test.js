// @vitest-environment node
// 仕様: docs/03-functional-design.md 2.5
import { describe, it, expect } from "vitest";
import { sortRows } from "../../src/utils/sortRows.js";

const asc = (column) => ({ column, direction: "asc" });
const desc = (column) => ({ column, direction: "desc" });
const vals = (rows, column) => rows.map((r) => r[column]);
const rowsOf = (column, values) =>
  values.map((v, i) => ({ [column]: v, id: String(i) }));

describe("sortRows", () => {
  describe("number", () => {
    const rows = rowsOf("n", ["10", "9", "100", "-5", "2.5"]);

    it("昇順は数値順（文字列順ではない）", () => {
      expect(vals(sortRows(rows, asc("n"), "number"), "n")).toEqual([
        "-5",
        "2.5",
        "9",
        "10",
        "100",
      ]);
    });

    it("降順は数値の大きい順", () => {
      expect(vals(sortRows(rows, desc("n"), "number"), "n")).toEqual([
        "100",
        "10",
        "9",
        "2.5",
        "-5",
      ]);
    });

    it("カンマ付きの数字も数値として並べる", () => {
      const r = rowsOf("n", ["1,200", "300", "25,000"]);
      expect(vals(sortRows(r, asc("n"), "number"), "n")).toEqual([
        "300",
        "1,200",
        "25,000",
      ]);
    });
  });

  describe("date", () => {
    it("日付順（YYYY/MM/DD と YYYY-MM-DD が混在しても正しく並ぶ）", () => {
      const rows = rowsOf("d", [
        "2024-03-01",
        "2024/01/15",
        "2024-02-10",
        "2023-12-31",
      ]);
      expect(vals(sortRows(rows, asc("d"), "date"), "d")).toEqual([
        "2023-12-31",
        "2024/01/15",
        "2024-02-10",
        "2024-03-01",
      ]);
      expect(vals(sortRows(rows, desc("d"), "date"), "d")).toEqual([
        "2024-03-01",
        "2024-02-10",
        "2024/01/15",
        "2023-12-31",
      ]);
    });
  });

  describe("string（日本語ロケール順）", () => {
    it("ひらがなは五十音順", () => {
      const rows = rowsOf("s", ["りんご", "みかん", "いちご", "ばなな"]);
      expect(vals(sortRows(rows, asc("s"), "string"), "s")).toEqual([
        "いちご",
        "ばなな",
        "みかん",
        "りんご",
      ]);
    });

    it("降順は逆順", () => {
      const rows = rowsOf("s", ["りんご", "みかん", "いちご"]);
      expect(vals(sortRows(rows, desc("s"), "string"), "s")).toEqual([
        "りんご",
        "みかん",
        "いちご",
      ]);
    });

    it("数字を含む文字列は文字列として比較する（数値順にしない）", () => {
      const rows = rowsOf("s", ["10", "9", "2"]);
      expect(vals(sortRows(rows, asc("s"), "string"), "s")).toEqual([
        "10",
        "2",
        "9",
      ]);
    });
  });

  describe("空欄は昇順・降順とも最後尾", () => {
    it("number: 昇順・降順どちらでも空欄が最後", () => {
      const rows = rowsOf("n", ["3", "", "1", "", "2"]);
      expect(vals(sortRows(rows, asc("n"), "number"), "n")).toEqual([
        "1",
        "2",
        "3",
        "",
        "",
      ]);
      expect(vals(sortRows(rows, desc("n"), "number"), "n")).toEqual([
        "3",
        "2",
        "1",
        "",
        "",
      ]);
    });

    it("date: 昇順・降順どちらでも空欄が最後", () => {
      const rows = rowsOf("d", ["", "2024-01-02", "2024-01-01"]);
      expect(vals(sortRows(rows, asc("d"), "date"), "d")).toEqual([
        "2024-01-01",
        "2024-01-02",
        "",
      ]);
      expect(vals(sortRows(rows, desc("d"), "date"), "d")).toEqual([
        "2024-01-02",
        "2024-01-01",
        "",
      ]);
    });

    it("string: 昇順・降順どちらでも空欄が最後", () => {
      const rows = rowsOf("s", ["", "みかん", "いちご"]);
      expect(vals(sortRows(rows, asc("s"), "string"), "s")).toEqual([
        "いちご",
        "みかん",
        "",
      ]);
      expect(vals(sortRows(rows, desc("s"), "string"), "s")).toEqual([
        "みかん",
        "いちご",
        "",
      ]);
    });

    it("空欄同士は元の順序を保つ", () => {
      const rows = rowsOf("n", ["", "2", ""]);
      expect(sortRows(rows, asc("n"), "number").map((r) => r.id)).toEqual([
        "1",
        "0",
        "2",
      ]);
      expect(sortRows(rows, desc("n"), "number").map((r) => r.id)).toEqual([
        "1",
        "0",
        "2",
      ]);
    });
  });

  describe("列の型で解釈できない値は空欄と同様に最後尾", () => {
    it('number 列の "abc" は最後尾（昇順・降順とも）', () => {
      const rows = rowsOf("n", ["3", "abc", "1", ""]);
      expect(vals(sortRows(rows, asc("n"), "number"), "n")).toEqual([
        "1",
        "3",
        "abc",
        "",
      ]);
      expect(vals(sortRows(rows, desc("n"), "number"), "n")).toEqual([
        "3",
        "1",
        "abc",
        "",
      ]);
    });

    it("date 列の日付でない値は最後尾", () => {
      const rows = rowsOf("d", ["xxxx", "2024-01-02", "2024-01-01"]);
      expect(vals(sortRows(rows, asc("d"), "date"), "d")).toEqual([
        "2024-01-01",
        "2024-01-02",
        "xxxx",
      ]);
      expect(vals(sortRows(rows, desc("d"), "date"), "d")).toEqual([
        "2024-01-02",
        "2024-01-01",
        "xxxx",
      ]);
    });
  });

  describe("安定ソート", () => {
    it("同じ値の行は元の順序を保つ（昇順）", () => {
      const rows = [
        { k: "1", id: "a" },
        { k: "2", id: "b" },
        { k: "1", id: "c" },
        { k: "2", id: "d" },
        { k: "1", id: "e" },
      ];
      expect(sortRows(rows, asc("k"), "number").map((r) => r.id)).toEqual([
        "a",
        "c",
        "e",
        "b",
        "d",
      ]);
    });

    it("同じ値の行は元の順序を保つ（降順でも逆順にならない）", () => {
      const rows = [
        { k: "1", id: "a" },
        { k: "2", id: "b" },
        { k: "1", id: "c" },
        { k: "2", id: "d" },
      ];
      expect(sortRows(rows, desc("k"), "number").map((r) => r.id)).toEqual([
        "b",
        "d",
        "a",
        "c",
      ]);
    });

    it('数値として等しい値（"5" と "5.0"）も元の順序を保つ', () => {
      const rows = [
        { k: "5.0", id: "a" },
        { k: "5", id: "b" },
      ];
      expect(sortRows(rows, asc("k"), "number").map((r) => r.id)).toEqual([
        "a",
        "b",
      ]);
    });
  });

  describe("元配列を変更しない", () => {
    it("新しい配列を返し、元の配列の順序・中身は変わらない", () => {
      const rows = rowsOf("n", ["3", "1", "2"]);
      const before = structuredClone(rows);
      const result = sortRows(rows, asc("n"), "number");
      expect(result).not.toBe(rows);
      expect(rows).toEqual(before);
    });

    it("件数は変わらない", () => {
      const rows = rowsOf("n", ["3", "", "abc", "1"]);
      expect(sortRows(rows, asc("n"), "number")).toHaveLength(4);
    });
  });

  describe("境界値", () => {
    it("空配列は空配列", () => {
      expect(sortRows([], asc("n"), "number")).toEqual([]);
    });

    it("1 件はそのまま", () => {
      const rows = rowsOf("n", ["1"]);
      expect(sortRows(rows, asc("n"), "number")).toEqual(rows);
    });

    it("存在しない列は全行が空欄扱いになり、元の順序のまま返す", () => {
      const rows = rowsOf("n", ["3", "1", "2"]);
      expect(sortRows(rows, asc("ない列"), "number")).toEqual(rows);
      expect(sortRows(rows, desc("ない列"), "string")).toEqual(rows);
    });
  });

  describe("異常系（RangeError）", () => {
    const rows = rowsOf("n", ["1", "2"]);

    it("不正な direction は RangeError", () => {
      expect(() =>
        sortRows(rows, { column: "n", direction: "up" }, "number"),
      ).toThrow(RangeError);
    });

    it("不正な columnType は RangeError", () => {
      expect(() => sortRows(rows, asc("n"), "boolean")).toThrow(RangeError);
    });
  });
});
