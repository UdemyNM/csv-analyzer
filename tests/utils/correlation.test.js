// @vitest-environment node
// 仕様: docs/03-functional-design.md 2.8（ピアソン相関・ペアワイズ除外）
// 入力: 列ごとの文字列配列の配列（string[][]）、出力: (number|null)[][]
import { describe, it, expect } from "vitest";
import { correlation } from "../../src/utils/correlation.js";

describe("correlation", () => {
  describe("既知値", () => {
    it("完全な正の相関は 1、負の相関は -1", () => {
      const m = correlation([
        ["1", "2", "3", "4", "5"],
        ["2", "4", "6", "8", "10"],
        ["10", "8", "6", "4", "2"],
      ]);
      expect(m[0][1]).toBeCloseTo(1, 10);
      expect(m[0][2]).toBeCloseTo(-1, 10);
      expect(m[1][2]).toBeCloseTo(-1, 10);
    });

    it("x=[1..5], y=[2,4,5,4,5] の相関は 6/sqrt(60) ≒ 0.7746", () => {
      const m = correlation([
        ["1", "2", "3", "4", "5"],
        ["2", "4", "5", "4", "5"],
      ]);
      expect(m[0][1]).toBeCloseTo(6 / Math.sqrt(60), 10);
    });

    it("値の大きさ（スケール）が違っても相関は同じ", () => {
      const m = correlation([
        ["1", "2", "3", "4", "5"],
        ["2", "4", "5", "4", "5"],
        ["2000", "4000", "5000", "4000", "5000"],
      ]);
      expect(m[0][2]).toBeCloseTo(m[0][1], 10);
    });

    it("カンマ付き（1,000）も数値として扱う", () => {
      const m = correlation([
        ["1,000", "2,000", "3,000"],
        ["1", "2", "3"],
      ]);
      expect(m[0][1]).toBeCloseTo(1, 10);
    });
  });

  describe("行列の形", () => {
    it("列数 × 列数の行列で、対角は 1、対称", () => {
      const m = correlation([
        ["1", "2", "3", "4"],
        ["2", "1", "4", "3"],
        ["5", "3", "4", "1"],
      ]);
      expect(m).toHaveLength(3);
      m.forEach((row, i) => {
        expect(row).toHaveLength(3);
        expect(row[i]).toBe(1);
        row.forEach((v, j) => expect(v).toBe(m[j][i]));
      });
    });

    it("並び順は入力の列順と同じ添字", () => {
      const m = correlation([
        ["1", "2", "3"],
        ["3", "2", "1"],
        ["1", "2", "3"],
      ]);
      expect(m[0][1]).toBeCloseTo(-1, 10);
      expect(m[0][2]).toBeCloseTo(1, 10);
      expect(m[1][2]).toBeCloseTo(-1, 10);
    });

    it("1 列だけなら [[1]]", () => {
      expect(correlation([["1", "2", "3"]])).toEqual([[1]]);
    });
  });

  describe("欠損（ペアワイズ除外）", () => {
    it("2 列のどちらかが空欄の行は、その組だけ除外する", () => {
      const m = correlation([
        ["1", "2", "3", "4", "5"],
        ["2", "4", "", "8", "10"],
      ]);
      // 有効ペアは (1,2)(2,4)(4,8)(5,10) で完全な正の相関
      expect(m[0][1]).toBeCloseTo(1, 10);
    });

    it("他の列の欠損は、その組の相関に影響しない", () => {
      const withZ = correlation([
        ["1", "2", "3", "4", "5"],
        ["2", "4", "5", "4", "5"],
        ["", "9", "", "1", ""],
      ]);
      const withoutZ = correlation([
        ["1", "2", "3", "4", "5"],
        ["2", "4", "5", "4", "5"],
      ]);
      expect(withZ[0][1]).toBeCloseTo(withoutZ[0][1], 10);
    });

    it("組ごとに有効なペアが違っても、それぞれの組で計算する", () => {
      const m = correlation([
        ["1", "2", "3", "4"],
        ["2", "4", "6", ""],
        ["", "3", "2", "1"],
      ]);
      expect(m[0][1]).toBeCloseTo(1, 10); // 行 0〜2
      expect(m[0][2]).toBeCloseTo(-1, 10); // 行 1〜3: (2,3)(3,2)(4,1)
      expect(m[1][2]).toBeCloseTo(-1, 10); // 行 1〜2: (4,3)(6,2) の 2 件
    });

    it('数値でない値（"abc"）は空欄と同じくペアから除外する', () => {
      const m = correlation([
        ["1", "2", "abc", "4"],
        ["2", "4", "6", "8"],
      ]);
      expect(m[0][1]).toBeCloseTo(1, 10);
    });
  });

  describe("null になる場合（対角以外）", () => {
    it("分散 0 の列（すべて同じ値）との相関は null。対角は 1", () => {
      const m = correlation([
        ["1", "2", "3"],
        ["5", "5", "5"],
      ]);
      expect(m[0][1]).toBeNull();
      expect(m[1][0]).toBeNull();
      expect(m[1][1]).toBe(1);
      expect(m[0][0]).toBe(1);
    });

    it("丸め誤差が出る値（0.1 の繰り返し）でも、分散 0 として null になる", () => {
      const m = correlation([
        ["0.1", "0.1", "0.1", "0.1", "0.1", "0.1", "0.1"],
        ["1", "2", "3", "4", "5", "6", "7"],
      ]);
      expect(m[0][1]).toBeNull();
    });

    it("分散 0 は「有効ペアの値がすべて同じ」で判定する（列全体では変化していても null）", () => {
      const m = correlation([
        ["1", "2", ""],
        ["5", "5", "9"],
      ]);
      // 有効ペアは (1,5)(2,5)。2 列目はペア内で同じ値
      expect(m[0][1]).toBeNull();
    });

    it("有効なペアが 1 件しかない組は null", () => {
      const m = correlation([
        ["1", "2", ""],
        ["2", "3", "4"],
        ["", "", "9"],
      ]);
      expect(m[0][1]).toBeCloseTo(1, 10); // (1,2)(2,3)
      expect(m[0][2]).toBeNull(); // 重なる行がない（0 件）
      expect(m[1][2]).toBeNull(); // 重なる行が 1 件
    });

    it("有効なペアが 2 件あれば計算する（境界値）", () => {
      const m = correlation([
        ["1", "2", ""],
        ["3", "5", "8"],
      ]);
      expect(m[0][1]).toBeCloseTo(1, 10);
    });
  });

  describe("対角は常に 1", () => {
    it("分散 0 の列でも対角は 1", () => {
      const m = correlation([["4", "4", "4"]]);
      expect(m).toEqual([[1]]);
    });

    it("全て空欄の列でも対角は 1、他との相関は null", () => {
      const m = correlation([
        ["", "", ""],
        ["1", "2", "3"],
      ]);
      expect(m[0][0]).toBe(1);
      expect(m[0][1]).toBeNull();
      expect(m[1][0]).toBeNull();
      expect(m[1][1]).toBe(1);
    });
  });

  describe("入力を変更しない", () => {
    it("columnsValues は変更されない", () => {
      const input = [
        ["1", "2", "3"],
        ["3", "", "1"],
      ];
      const before = structuredClone(input);
      correlation(input);
      expect(input).toEqual(before);
    });
  });
});
