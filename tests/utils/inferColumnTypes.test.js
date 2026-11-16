// @vitest-environment node
// 仕様: docs/03-functional-design.md 2.3
import { describe, it, expect } from "vitest";
import { inferColumnTypes } from "../../src/utils/inferColumnTypes.js";

const col = (values, name = "c") => values.map((v) => ({ [name]: v }));
const typeOf = (values) => inferColumnTypes(["c"], col(values))[0].type;

describe("inferColumnTypes", () => {
  describe("戻り値の形", () => {
    it("ヘッダーの順に {name, type} を返す", () => {
      const rows = [
        { 店舗: "渋谷店", 日付: "2024-01-01", 売上: "1000" },
        { 店舗: "新宿店", 日付: "2024-01-02", 売上: "2000" },
      ];
      expect(inferColumnTypes(["店舗", "日付", "売上"], rows)).toEqual([
        { name: "店舗", type: "string" },
        { name: "日付", type: "date" },
        { name: "売上", type: "number" },
      ]);
    });
  });

  describe("number", () => {
    it("整数・小数・負数はすべて number", () => {
      expect(typeOf(["1", "2.5", "-3", "0"])).toBe("number");
    });

    it("カンマ区切り（1,234）も number", () => {
      expect(typeOf(["1,234", "56", "1,234,567.89"])).toBe("number");
    });

    it("空欄を除いた値がすべて数値なら number", () => {
      expect(typeOf(["1", "", "3", ""])).toBe("number");
    });

    it("数値が 1 件だけでも number", () => {
      expect(typeOf(["42"])).toBe("number");
    });

    it("先頭 0 の数字（001）も number", () => {
      expect(typeOf(["001", "002"])).toBe("number");
    });

    it("日付ではなく 8 桁の数字（20240101）は number", () => {
      expect(typeOf(["20240101", "20240102"])).toBe("number");
    });
  });

  describe("date", () => {
    it("YYYY-MM-DD はすべて date", () => {
      expect(typeOf(["2024-01-01", "2024-02-29"])).toBe("date");
    });

    it("YYYY/MM/DD も date", () => {
      expect(typeOf(["2024/01/01", "2024/12/31"])).toBe("date");
    });

    it("YYYY-MM-DD と YYYY/MM/DD が混ざっても、すべて日付なら date", () => {
      expect(typeOf(["2024-01-01", "2024/01/02"])).toBe("date");
    });

    it("空欄を除いた値がすべて日付なら date", () => {
      expect(typeOf(["2024-01-01", "", "2024-01-03"])).toBe("date");
    });
  });

  describe("string", () => {
    it("文字列だけの列は string", () => {
      expect(typeOf(["渋谷店", "新宿店"])).toBe("string");
    });

    it("数値と文字列の混在は string", () => {
      expect(typeOf(["1", "2", "abc"])).toBe("string");
    });

    it("日付と文字列の混在は string", () => {
      expect(typeOf(["2024-01-01", "abc"])).toBe("string");
    });

    it("数値と日付の混在は string", () => {
      expect(typeOf(["2024-01-01", "5"])).toBe("string");
    });

    it("存在しない日付（2024-02-30, 2024-13-01）が混じると string", () => {
      expect(typeOf(["2024-01-01", "2024-02-30"])).toBe("string");
      expect(typeOf(["2024-13-01"])).toBe("string");
    });

    it("時刻つき（2024-01-01 12:51:09）は仕様の日付形式ではないので string", () => {
      expect(typeOf(["2024-01-01 12:51:09", "2024-01-02 08:00:00"])).toBe(
        "string",
      );
    });

    it("1 件でも数値でない値があれば string（Infinity / NaN / 0x10 は数値ではない）", () => {
      expect(typeOf(["1", "Infinity"])).toBe("string");
      expect(typeOf(["NaN"])).toBe("string");
      expect(typeOf(["0x10"])).toBe("string");
    });

    it("りんご;みかん のような複数値セルは string", () => {
      expect(typeOf(["りんご;みかん", "みかん"])).toBe("string");
    });
  });

  describe("全て空欄・データなし", () => {
    it("全て空欄の列は string", () => {
      expect(typeOf(["", "", ""])).toBe("string");
    });

    it("データ 0 行なら、すべての列が string", () => {
      expect(inferColumnTypes(["a", "b"], [])).toEqual([
        { name: "a", type: "string" },
        { name: "b", type: "string" },
      ]);
    });

    it("ヘッダーが空配列なら空配列", () => {
      expect(inferColumnTypes([], [])).toEqual([]);
    });
  });

  describe("入力を変更しない", () => {
    it("headers と rows は変更されない", () => {
      const headers = ["c"];
      const rows = col(["1", "2"]);
      const headersCopy = structuredClone(headers);
      const rowsCopy = structuredClone(rows);
      inferColumnTypes(headers, rows);
      expect(headers).toEqual(headersCopy);
      expect(rows).toEqual(rowsCopy);
    });
  });
});
