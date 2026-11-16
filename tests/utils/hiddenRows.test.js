// @vitest-environment node
// 仕様: docs/superpowers/specs/2026-11-16-analysis-page-redesign-design.md 6.2
import { describe, it, expect } from "vitest";
import {
  buildRowIndex,
  excludeHiddenRows,
} from "../../src/utils/hiddenRows.js";

const rows = [{ n: "0" }, { n: "1" }, { n: "2" }, { n: "3" }];

describe("excludeHiddenRows", () => {
  it("元の行番号 [1, 3] を除く", () => {
    expect(excludeHiddenRows(rows, [1, 3])).toEqual([{ n: "0" }, { n: "2" }]);
  });

  it("空なら同じ参照を返す（後段の useMemo を作り直させない）", () => {
    expect(excludeHiddenRows(rows, [])).toBe(rows);
  });

  it("25 万行・1,000 行を除いて 0.1 秒未満", () => {
    const big = Array.from({ length: 250_000 }, (_, i) => ({ n: String(i) }));
    const hidden = Array.from({ length: 1000 }, (_, i) => i * 200);
    excludeHiddenRows(big, hidden); // ウォームアップ
    const start = performance.now();
    const result = excludeHiddenRows(big, hidden);
    const ms = performance.now() - start;
    expect(result).toHaveLength(249_000);
    expect(ms).toBeLessThan(100);
  });
});

describe("buildRowIndex", () => {
  it("行オブジェクトから元の行番号を引ける", () => {
    const index = buildRowIndex(rows);
    expect(index.get(rows[2])).toBe(2);
    expect(index.get({ n: "2" })).toBeUndefined();
  });
});
