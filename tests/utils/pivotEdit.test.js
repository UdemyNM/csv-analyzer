// @vitest-environment node
// 仕様: docs/superpowers/specs/2026-11-16-analysis-page-redesign-design.md 7.1 / 8.3
import { describe, it, expect } from "vitest";
import {
  applyFieldMove,
  setValueFn,
  defaultFn,
  allowedFns,
} from "../../src/utils/pivotEdit.js";

const TYPES = {
  店舗: "string",
  商品: "string",
  売上: "number",
  数量: "number",
  "売上:税込": "number",
};
const typeOf = (name) => TYPES[name] ?? "string";
const EMPTY = { pivot: null, scatter: null };
const P = (rows = [], columns = [], values = []) => ({
  pivot: { rows, columns, values },
  scatter: null,
});
const move = (state, field, from, to) =>
  applyFieldMove(state, { field, from, to }, typeOf);

describe("applyFieldMove: 行・列", () => {
  it("一覧から rows へ（from なし）→ 末尾に入る", () => {
    const s = move(P(["商品"]), "店舗", null, { slot: "rows" });
    expect(s.pivot.rows).toEqual(["商品", "店舗"]);
  });

  it("空の状態から入れると pivot ができる", () => {
    expect(move(EMPTY, "店舗", null, { slot: "rows" }).pivot).toEqual({
      rows: ["店舗"],
      columns: [],
      values: [],
    });
  });

  it("rows の 0 番目を columns へ → rows から消え columns に入る", () => {
    const s = move(
      P(["店舗", "商品"]),
      "店舗",
      { slot: "rows", index: 0 },
      { slot: "columns" },
    );
    expect(s.pivot.rows).toEqual(["商品"]);
    expect(s.pivot.columns).toEqual(["店舗"]);
  });

  it("店舗が columns にあるとき rows へ入れる → columns から消える", () => {
    const s = move(P([], ["店舗"]), "店舗", null, { slot: "rows" });
    expect(s.pivot.rows).toEqual(["店舗"]);
    expect(s.pivot.columns).toEqual([]);
  });

  it("同じ枠の中で index 0 へ → 並びが変わる", () => {
    const s = move(
      P(["店舗", "商品"]),
      "商品",
      { slot: "rows", index: 1 },
      { slot: "rows", index: 0 },
    );
    expect(s.pivot.rows).toEqual(["商品", "店舗"]);
  });

  it("同じ枠の中で後ろのチップの上に落とすと、そのチップの前に入る", () => {
    const s = move(
      P(["店舗", "商品", "売上"]),
      "店舗",
      { slot: "rows", index: 0 },
      { slot: "rows", index: 2 },
    );
    expect(s.pivot.rows).toEqual(["商品", "店舗", "売上"]);
  });

  it("一覧から、すでに同じ枠にある列を入れても二重にならない", () => {
    const s = move(P(["店舗"]), "店舗", null, { slot: "rows" });
    expect(s.pivot.rows).toEqual(["店舗"]);
  });

  it("枠の外へ（to なし）→ 外れる。全部空なら pivot は null", () => {
    const s = move(P(["店舗"]), "店舗", { slot: "rows", index: 0 }, null);
    expect(s.pivot).toBeNull();
  });

  it("一覧から枠の外へ（from も to もなし）→ 変わらない", () => {
    const state = P(["店舗"]);
    expect(move(state, "店舗", null, null)).toBe(state);
  });
});

describe("applyFieldMove: 値", () => {
  it("数値の列は合計、文字列の列は件数で入る", () => {
    let s = move(EMPTY, "売上", null, { slot: "values" });
    s = move(s, "店舗", null, { slot: "values" });
    expect(s.pivot.values).toEqual([
      { column: "売上", fn: "sum" },
      { column: "店舗", fn: "count" },
    ]);
  });

  it("同じ列・同じ関数は二重に入らない", () => {
    const s = move(P([], [], [{ column: "売上", fn: "sum" }]), "売上", null, {
      slot: "values",
    });
    expect(s.pivot.values).toHaveLength(1);
  });

  it("行に置いた列も値に置ける（行には残る）", () => {
    const s = move(P(["店舗"]), "店舗", null, { slot: "values" });
    expect(s.pivot.rows).toEqual(["店舗"]);
    expect(s.pivot.values).toEqual([{ column: "店舗", fn: "count" }]);
  });

  it("値の中で並べ替えると、関数を保ったまま動く", () => {
    const state = P(
      [],
      [],
      [
        { column: "売上", fn: "avg" },
        { column: "数量", fn: "sum" },
      ],
    );
    const s = move(
      state,
      "数量",
      { slot: "values", index: 1 },
      { slot: "values", index: 0 },
    );
    expect(s.pivot.values).toEqual([
      { column: "数量", fn: "sum" },
      { column: "売上", fn: "avg" },
    ]);
  });

  it("値から行へ動かすと、値からは外れる", () => {
    const s = move(
      P([], [], [{ column: "売上", fn: "sum" }]),
      "売上",
      { slot: "values", index: 0 },
      { slot: "rows" },
    );
    expect(s.pivot.values).toEqual([]);
    expect(s.pivot.rows).toEqual(["売上"]);
  });
});

describe("applyFieldMove: 散布図", () => {
  it("scatterX に文字列の列は入らない", () => {
    expect(move(EMPTY, "店舗", null, { slot: "scatterX" })).toEqual(EMPTY);
  });

  it("scatterX / scatterY は 1 つだけ持ち、置き換える", () => {
    let s = move(EMPTY, "数量", null, { slot: "scatterX" });
    s = move(s, "売上", null, { slot: "scatterY" });
    s = move(s, "数量", null, { slot: "scatterY" });
    expect(s.scatter).toEqual({ x: "数量", y: "数量" });
  });

  it("散布図の枠の外へドラッグすると外れる", () => {
    const s = move(
      { pivot: null, scatter: { x: "数量", y: "売上" } },
      "数量",
      { slot: "scatterX", index: 0 },
      null,
    );
    expect(s.scatter).toEqual({ x: "", y: "売上" });
  });
});

describe("Review Focus 1: 記号を含む列名", () => {
  it('列名に ":" "/" を含んでいても動く', () => {
    let s = move(EMPTY, "売上:税込", null, { slot: "rows" });
    s = move(s, "売上:税込", { slot: "rows", index: 0 }, { slot: "values" });
    expect(s.pivot).toEqual({
      rows: [],
      columns: [],
      values: [{ column: "売上:税込", fn: "sum" }],
    });
  });
});

describe("setValueFn / defaultFn / allowedFns", () => {
  it("2 番目の値を avg にする", () => {
    const pivot = {
      rows: [],
      columns: [],
      values: [
        { column: "売上", fn: "sum" },
        { column: "数量", fn: "sum" },
      ],
    };
    expect(setValueFn(pivot, 1, "avg").values[1]).toEqual({
      column: "数量",
      fn: "avg",
    });
    expect(pivot.values[1].fn).toBe("sum"); // 元は変えない
  });

  it("number は sum と 5 種、それ以外は count だけ（Review Focus 5）", () => {
    expect(defaultFn("number")).toBe("sum");
    expect(defaultFn("date")).toBe("count");
    expect(allowedFns("number")).toEqual(["sum", "avg", "count", "min", "max"]);
    expect(allowedFns("string")).toEqual(["count"]);
  });
});
