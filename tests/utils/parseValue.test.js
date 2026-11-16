// @vitest-environment node
// 仕様: docs/03-functional-design.md 2.4 末尾（数値・日付の解釈は parseValue.js に集約）
// 戻り値の約束（仕様に明記がないため、このテストで次のとおり固定する。実装前に要確認）
//   parseNumber(text)   -> number。解釈できない・空欄は null
//   normalizeDate(text) -> 'YYYY-MM-DD' の文字列。解釈できない・空欄は null
import { describe, it, expect } from "vitest";
import { parseNumber, normalizeDate } from "../../src/utils/parseValue.js";

describe("parseNumber", () => {
  describe("正常系", () => {
    it.each([
      ["0", 0],
      ["42", 42],
      ["-7", -7],
      ["3.14", 3.14],
      ["-0.5", -0.5],
      ["1,234", 1234],
      ["1,234,567", 1234567],
      ["1,234.56", 1234.56],
      ["-1,234", -1234],
      ["001", 1],
    ])("%s -> %d", (text, expected) => {
      expect(parseNumber(text)).toBe(expected);
    });
  });

  describe("異常系・境界値", () => {
    it.each([
      [""],
      ["abc"],
      ["12abc"],
      ["1.2.3"],
      ["-"],
      ["Infinity"],
      ["NaN"],
      ["0x10"],
      ["2024-01-01"],
      ["2024/01/01"],
      ["1,23x"],
    ])("%j は数値として解釈できず null", (text) => {
      expect(parseNumber(text)).toBeNull();
    });
  });
});

describe("normalizeDate", () => {
  describe("正常系", () => {
    it("YYYY-MM-DD はそのまま返す", () => {
      expect(normalizeDate("2024-01-05")).toBe("2024-01-05");
    });

    it("YYYY/MM/DD は YYYY-MM-DD に正規化する", () => {
      expect(normalizeDate("2024/01/05")).toBe("2024-01-05");
    });

    it("うるう日（2024-02-29）は有効", () => {
      expect(normalizeDate("2024-02-29")).toBe("2024-02-29");
    });
  });

  describe("異常系・境界値", () => {
    it.each([
      [""],
      ["abc"],
      ["2024-1-5x"],
      ["2024-13-01"],
      ["2024-02-30"],
      ["2023-02-29"],
      ["12345"],
      ["2024-01-01 12:51:09"],
    ])("%j は日付として解釈できず null", (text) => {
      expect(normalizeDate(text)).toBeNull();
    });
  });
});
