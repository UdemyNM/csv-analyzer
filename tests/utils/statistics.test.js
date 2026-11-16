// @vitest-environment node
// 仕様: docs/03-functional-design.md 2.7（標準偏差は標本標準偏差 = n-1 で割る）
import { describe, it, expect } from "vitest";
import { statistics } from "../../src/utils/statistics.js";

describe("statistics", () => {
  describe("既知値", () => {
    it("[2,4,4,4,5,5,7,9]: 標本標準偏差は sqrt(32/7)（母標準偏差の 2 ではない）", () => {
      const s = statistics(["2", "4", "4", "4", "5", "5", "7", "9"]);
      expect(s.count).toBe(8);
      expect(s.missing).toBe(0);
      expect(s.mean).toBe(5);
      expect(s.median).toBe(4.5);
      expect(s.min).toBe(2);
      expect(s.max).toBe(9);
      expect(s.stdDev).toBeCloseTo(Math.sqrt(32 / 7), 10);
      expect(s.stdDev).not.toBeCloseTo(2, 3);
    });

    it("[1,2,3,4,5]: 平均 3・中央値 3（奇数件）・標準偏差 sqrt(2.5)", () => {
      const s = statistics(["1", "2", "3", "4", "5"]);
      expect(s).toEqual({
        count: 5,
        missing: 0,
        mean: 3,
        median: 3,
        stdDev: expect.closeTo(Math.sqrt(2.5), 10),
        min: 1,
        max: 5,
      });
    });

    it("戻り値のキーは仕様どおり", () => {
      expect(Object.keys(statistics(["1", "2"])).sort()).toEqual(
        ["count", "max", "mean", "median", "min", "missing", "stdDev"].sort(),
      );
    });

    it("小数・負数", () => {
      const s = statistics(["-1.5", "0", "1.5"]);
      expect(s.mean).toBe(0);
      expect(s.median).toBe(0);
      expect(s.min).toBe(-1.5);
      expect(s.max).toBe(1.5);
      expect(s.stdDev).toBeCloseTo(1.5, 10);
    });
  });

  describe("中央値", () => {
    it("偶数件は中央 2 件の平均", () => {
      expect(statistics(["1", "2", "3", "10"]).median).toBe(2.5);
    });

    it("並んでいない入力でも正しい中央値（数値順）", () => {
      expect(statistics(["10", "2", "33"]).median).toBe(10);
    });

    it("入力の配列は変更されない", () => {
      const values = ["5", "1", "3"];
      statistics(values);
      expect(values).toEqual(["5", "1", "3"]);
    });
  });

  describe("文字列の解釈", () => {
    it("カンマ付き（1,234）も数値として計算する", () => {
      const s = statistics(["1,000", "2,000", "3,000"]);
      expect(s.count).toBe(3);
      expect(s.mean).toBe(2000);
      expect(s.max).toBe(3000);
    });
  });

  describe("欠損", () => {
    it("空欄は missing に数え、count と計算から除外する（count + missing = 全要素数）", () => {
      const s = statistics(["1", "", "3", "", "5"]);
      expect(s.count).toBe(3);
      expect(s.missing).toBe(2);
      expect(s.count + s.missing).toBe(5);
      expect(s.mean).toBe(3);
      expect(s.median).toBe(3);
      expect(s.min).toBe(1);
      expect(s.max).toBe(5);
    });

    it('数値として解釈できない文字列（"abc"）も missing に数え、計算から除外する', () => {
      const s = statistics(["10", "abc", "20"]);
      expect(s.count).toBe(2);
      expect(s.missing).toBe(1);
      expect(s.mean).toBe(15);
    });
  });

  describe("境界値", () => {
    it("有効値が 1 件のとき stdDev は null（n-1=0）。他は値そのもの", () => {
      expect(statistics(["7"])).toEqual({
        count: 1,
        missing: 0,
        mean: 7,
        median: 7,
        stdDev: null,
        min: 7,
        max: 7,
      });
    });

    it("有効値が 1 件＋欠損でも stdDev は null", () => {
      const s = statistics(["", "7", ""]);
      expect(s.count).toBe(1);
      expect(s.missing).toBe(2);
      expect(s.stdDev).toBeNull();
    });

    it("有効値が 0 件（全て空欄）のとき mean 等は null、missing は件数", () => {
      expect(statistics(["", "", ""])).toEqual({
        count: 0,
        missing: 3,
        mean: null,
        median: null,
        stdDev: null,
        min: null,
        max: null,
      });
    });

    it("空配列は count=0, missing=0 で、他は null", () => {
      expect(statistics([])).toEqual({
        count: 0,
        missing: 0,
        mean: null,
        median: null,
        stdDev: null,
        min: null,
        max: null,
      });
    });

    it("すべて同じ値なら stdDev は 0", () => {
      expect(statistics(["3", "3", "3"]).stdDev).toBe(0);
    });

    it("0 は有効な値（欠損にしない）", () => {
      const s = statistics(["0", "0"]);
      expect(s.count).toBe(2);
      expect(s.missing).toBe(0);
      expect(s.mean).toBe(0);
    });
  });
});
