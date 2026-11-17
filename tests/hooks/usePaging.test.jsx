// 対象: src/hooks/usePaging.js（DataTable と PivotTable の 100 行ページング）
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePaging } from "../../src/hooks/usePaging.js";

const rowsOf = (n) => Array.from({ length: n }, (_, i) => ({ i }));

describe("usePaging", () => {
  it("250 行で pageCount 3。goTo(2) で最後の 50 行", () => {
    const rows = rowsOf(250);
    const { result } = renderHook(() => usePaging(rows));
    expect(result.current.pageCount).toBe(3);
    expect(result.current.visible).toHaveLength(100);
    act(() => result.current.goTo(2));
    expect(result.current.page).toBe(2);
    expect(result.current.start).toBe(200);
    expect(result.current.visible).toHaveLength(50);
  });

  it("rows が変わると 0 ページ目に戻る", () => {
    const { result, rerender } = renderHook(({ rows }) => usePaging(rows), {
      initialProps: { rows: rowsOf(250) },
    });
    act(() => result.current.goTo(2));
    rerender({ rows: rowsOf(250) });
    expect(result.current.page).toBe(0);
  });

  it("0 行でも pageCount は 1", () => {
    const { result } = renderHook(() => usePaging([]));
    expect(result.current.pageCount).toBe(1);
    expect(result.current.visible).toEqual([]);
  });
});
