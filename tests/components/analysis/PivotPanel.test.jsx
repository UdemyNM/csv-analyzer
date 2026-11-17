// 対象: src/components/analysis/PivotPanel.jsx（ドラッグで組み立てるピボット。設計書 7 章）
// 契約: <PivotPanel columns pivot result onMove(move) onPivotChange(pivot) />（FieldDndProvider の中で使う）
//   - 列名の一覧（全列。非表示の列も）。行・列・値の 3 つの枠（FieldSlot）
//   - 値のチップに集計方法の select（数値でない列は件数だけ）
//   - result が null なら案内文、あれば PivotTable
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PivotPanel } from "../../../src/components/analysis/PivotPanel.jsx";
import { FieldDndProvider } from "../../../src/components/dnd/FieldDnd.jsx";
import { pivot as runPivot } from "../../../src/utils/pivot.js";
import { col } from "../uiAnalysisHelpers.jsx";

const COLUMNS = [col("店舗", "string"), col("売上", "number")];
const ROWS = [
  { 店舗: "東京", 売上: "100" },
  { 店舗: "大阪", 売上: "200" },
];
const typeOf = (name) => COLUMNS.find((c) => c.name === name)?.type;

function setup(pivot = null) {
  const onMove = vi.fn();
  const onPivotChange = vi.fn();
  render(
    <FieldDndProvider onMove={onMove}>
      <PivotPanel
        columns={COLUMNS}
        pivot={pivot}
        result={runPivot(ROWS, pivot, typeOf)}
        onMove={onMove}
        onPivotChange={onPivotChange}
      />
    </FieldDndProvider>,
  );
  return { user: userEvent.setup(), onMove, onPivotChange };
}

describe("PivotPanel", () => {
  it("列名の一覧に全列が出て、行・列・値の枠がある", () => {
    setup();
    const list = screen.getByRole("list", { name: "列名" });
    expect(within(list).getByText("店舗")).toBeInTheDocument();
    expect(within(list).getByText("売上")).toBeInTheDocument();
    for (const name of ["行", "列", "値"]) {
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
    }
  });

  it("行の「＋」で店舗を選ぶ → onMove（一覧から rows へ）", async () => {
    const { user, onMove } = setup();
    await user.click(screen.getByRole("button", { name: "行に列を追加" }));
    await user.click(
      within(screen.getByRole("list", { name: "行に追加する列" })).getByRole(
        "button",
        {
          name: "店舗",
        },
      ),
    );
    expect(onMove).toHaveBeenCalledWith({
      field: "店舗",
      from: null,
      to: { slot: "rows" },
    });
  });

  it("値のチップの × → onMove（values から外す）", async () => {
    const { user, onMove } = setup({
      rows: [],
      columns: [],
      values: [{ column: "売上", fn: "sum" }],
    });
    await user.click(
      screen.getByRole("button", { name: "値から「売上・合計」を外す" }),
    );
    expect(onMove).toHaveBeenCalledWith({
      field: "売上",
      from: { slot: "values", index: 0 },
      to: null,
    });
  });

  it("値の集計方法を「平均」にする → onPivotChange", async () => {
    const { user, onPivotChange } = setup({
      rows: ["店舗"],
      columns: [],
      values: [{ column: "売上", fn: "sum" }],
    });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "「売上・合計」の集計方法" }),
      "avg",
    );
    expect(onPivotChange).toHaveBeenCalledWith({
      rows: ["店舗"],
      columns: [],
      values: [{ column: "売上", fn: "avg" }],
    });
  });

  it("数値でない列の値は「件数」しか選べない（Review Focus 5）", () => {
    setup({ rows: [], columns: [], values: [{ column: "店舗", fn: "count" }] });
    const select = screen.getByRole("combobox", {
      name: "「店舗・件数」の集計方法",
    });
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["件数"]);
  });

  it("result が null なら案内文、あれば集計結果の表", () => {
    setup({ rows: ["店舗"], columns: [], values: [] });
    expect(
      screen.getByText("値の枠に列を置くと集計します"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "集計結果" }),
    ).not.toBeInTheDocument();
  });

  it("値があれば集計結果の表を出す", () => {
    setup({
      rows: ["店舗"],
      columns: [],
      values: [{ column: "売上", fn: "sum" }],
    });
    expect(
      screen.getByRole("region", { name: "集計結果" }),
    ).toBeInTheDocument();
  });
});
