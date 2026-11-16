// 対象: src/components/analysis/FilterBar.jsx（名前付き export { FilterBar }）
// 仕様: docs/superpowers/specs/2026-11-16-analysis-page-redesign-design.md 5.2
// 契約:
//   <FilterBar filters hiddenRowCount hiddenColumns onRemoveFilter(index) onShowAllRows()
//              onShowColumn(name) onClearAll() />
//   - 条件チップ: <ul aria-label="絞り込み条件"> の <li>。× は「条件「…」を削除」
//   - in は「店舗: 東京, 大阪」。3 つを超えたら先頭 2 つ＋「ほか N 件」。notIn は末尾に「以外」。空欄は「（空欄）」
//   - 「非表示の行 N件」チップ（× ですべて表示に戻す）、「非表示の列: 列名」チップ（列ごと）
//   - 何も無いときは案内文「列見出しの ▼ から絞り込めます」。何かあるときだけ「すべて解除」
//   - 「＋条件を追加」と並べ替えの欄は無い（列見出しのメニューへ移った）
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterBar } from "../../../src/components/analysis/FilterBar.jsx";

function setup(props = {}) {
  const handlers = {
    onRemoveFilter: vi.fn(),
    onShowAllRows: vi.fn(),
    onShowColumn: vi.fn(),
    onClearAll: vi.fn(),
  };
  render(
    <FilterBar
      filters={[]}
      hiddenRowCount={0}
      hiddenColumns={[]}
      {...handlers}
      {...props}
    />,
  );
  return { user: userEvent.setup(), ...handlers };
}

const chipTexts = () =>
  within(screen.getByRole("list", { name: "絞り込み条件" }))
    .getAllByRole("listitem")
    .map((li) => li.firstChild.textContent);

describe("FilterBar: チップの文言", () => {
  it("in / notIn / 演算子の条件", () => {
    setup({
      filters: [
        { column: "店舗", op: "in", values: ["東京", "大阪"] },
        { column: "商品", op: "notIn", values: ["りんご"] },
        { column: "売上", op: "gte", value: "1000" },
        { column: "地域", op: "contains", value: "東" },
      ],
    });
    expect(chipTexts()).toEqual([
      "店舗: 東京, 大阪",
      "商品: りんご 以外",
      "売上 ≥ 1000",
      "地域 を含む 東",
    ]);
  });

  it("値が 3 つを超えたら、先頭 2 つ＋「ほか N 件」。空欄は「（空欄）」", () => {
    setup({
      filters: [
        {
          column: "店舗",
          op: "in",
          values: ["", "東京", "大阪", "名古屋", "福岡"],
        },
        { column: "商品", op: "in", values: ["a", "b", "c"] },
      ],
    });
    expect(chipTexts()).toEqual([
      "店舗: （空欄）, 東京 ほか 3 件",
      "商品: a, b, c",
    ]);
  });

  it("× で、押したチップの添字を onRemoveFilter に渡す", async () => {
    const { user, onRemoveFilter } = setup({
      filters: [
        { column: "店舗", op: "eq", value: "東京" },
        { column: "売上", op: "gte", value: "1" },
      ],
    });
    await user.click(
      screen.getByRole("button", { name: "条件「売上 ≥ 1」を削除" }),
    );
    expect(onRemoveFilter).toHaveBeenCalledWith(1);
  });
});

describe("FilterBar: 非表示の行・列", () => {
  it("「非表示の行 3件」の × で onShowAllRows", async () => {
    const { user, onShowAllRows } = setup({ hiddenRowCount: 3 });
    expect(screen.getByText("非表示の行 3件")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "非表示の行をすべて表示" }),
    );
    expect(onShowAllRows).toHaveBeenCalled();
  });

  it('「非表示の列: 単価」の × で onShowColumn("単価")', async () => {
    const { user, onShowColumn } = setup({ hiddenColumns: ["単価", "日付"] });
    expect(screen.getByText("非表示の列: 単価")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "列「単価」を表示" }));
    expect(onShowColumn).toHaveBeenCalledWith("単価");
  });
});

describe("FilterBar: すべて解除と案内", () => {
  it("何かあるとき「すべて解除」で onClearAll", async () => {
    const { user, onClearAll } = setup({ hiddenRowCount: 1 });
    await user.click(screen.getByRole("button", { name: "すべて解除" }));
    expect(onClearAll).toHaveBeenCalled();
  });

  it("何も無いときは案内文だけで、「すべて解除」は出ない", () => {
    setup();
    expect(
      screen.getByText("列見出しの ▼ から絞り込めます"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "すべて解除" }),
    ).not.toBeInTheDocument();
  });

  it("「＋条件を追加」と並べ替えの欄は無い", () => {
    setup({ filters: [{ column: "店舗", op: "eq", value: "東京" }] });
    expect(
      screen.queryByRole("button", { name: /条件を追加/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
