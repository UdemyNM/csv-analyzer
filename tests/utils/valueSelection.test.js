// @vitest-environment node
// 仕様: docs/superpowers/specs/2026-11-16-analysis-page-redesign-design.md 6.1
import { describe, it, expect } from "vitest";
import {
  countValues,
  selectionToFilter,
  filterToSelection,
  findValueFilter,
  EMPTY_LABEL,
  VALUE_LIMIT,
} from "../../src/utils/valueSelection.js";

const rows = [
  { 店舗: "東京" },
  { 店舗: "大阪" },
  { 店舗: "東京" },
  { 店舗: "名古屋" },
  { 店舗: "大阪" },
];
const ALL5 = ["a", "b", "c", "d", "e"];

describe("countValues", () => {
  it("件数の多い順、同数は値の昇順", () => {
    expect(countValues(rows, "店舗")).toEqual([
      { value: "大阪", count: 2 },
      { value: "東京", count: 2 },
      { value: "名古屋", count: 1 },
    ]);
  });

  it('空欄は "" として数える', () => {
    const withBlank = [...rows, { 店舗: "" }, { 店舗: undefined }];
    expect(countValues(withBlank, "店舗")).toContainEqual({
      value: "",
      count: 2,
    });
  });
});

describe("selectionToFilter", () => {
  it("選んだほうが少なければ in", () => {
    expect(selectionToFilter("列", new Set(["a", "b"]), ALL5)).toEqual({
      column: "列",
      op: "in",
      values: ["a", "b"],
    });
  });

  it("外したほうが少なければ notIn", () => {
    expect(
      selectionToFilter("列", new Set(["a", "b", "c", "d"]), ALL5),
    ).toEqual({ column: "列", op: "notIn", values: ["e"] });
  });

  it("同数なら in", () => {
    expect(
      selectionToFilter("列", new Set(["a", "b"]), ["a", "b", "c", "d"]).op,
    ).toBe("in");
  });

  it("全部選んだら null", () => {
    expect(selectionToFilter("列", new Set(ALL5), ALL5)).toBeNull();
  });

  it("0 個は RangeError", () => {
    expect(() => selectionToFilter("列", new Set(), ALL5)).toThrow(RangeError);
  });

  it("空欄だけを選べる", () => {
    expect(selectionToFilter("列", new Set([""]), ["", "a", "b"])).toEqual({
      column: "列",
      op: "in",
      values: [""],
    });
  });
});

describe("filterToSelection", () => {
  it("undefined は全部", () => {
    expect(filterToSelection(undefined, ALL5)).toEqual(new Set(ALL5));
  });

  it("in は選んだ値", () => {
    expect(
      filterToSelection({ column: "列", op: "in", values: ["a"] }, ALL5),
    ).toEqual(new Set(["a"]));
  });

  it("notIn は外した値以外", () => {
    expect(
      filterToSelection({ column: "列", op: "notIn", values: ["a"] }, ALL5),
    ).toEqual(new Set(["b", "c", "d", "e"]));
  });
});

describe("findValueFilter", () => {
  it("その列の in / notIn を位置つきで返す。無ければ null", () => {
    const filters = [
      { column: "売上", op: "gte", value: "1" },
      { column: "店舗", op: "notIn", values: ["東京"] },
    ];
    expect(findValueFilter(filters, "店舗")).toEqual({
      index: 1,
      filter: filters[1],
    });
    expect(findValueFilter(filters, "売上")).toBeNull();
  });
});

it("定数: 空欄の表示名と候補の上限", () => {
  expect(EMPTY_LABEL).toBe("（空欄）");
  expect(VALUE_LIMIT).toBe(1000);
});
