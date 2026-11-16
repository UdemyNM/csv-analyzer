// 対象: src/components/analysis/FilterBar.jsx（名前付き export { FilterBar }）
// 仕様: docs/05 5 章「フィルタ条件はチップで表示し、× で削除、『＋条件を追加』で列・演算子・値を選ぶ」、
//       docs/03 1 章「フィルタバー: [条件チップ×][＋条件] 並べ替え[選択▼]」。列名は画面に固定しない
// 契約（仕様に細部がないため本テストで固定）:
//   <FilterBar columns={[{name,type}]} filters={[{column,op,value}]} sort={{column,direction}|null}
//              onAddFilter={(filter)=>void} onRemoveFilter={(index)=>void} onSortChange={(sort|null)=>void} />
//   - 条件チップ: <ul aria-label="絞り込み条件"> の <li>。文字に列名と値を含む。各 li に「削除」を名前に含む button（並び順 = filters の順）
//   - 「＋条件を追加」button（名前に「条件を追加」）を押すと入力欄が出る:
//       select「列」（option の value=列名）、select「演算子」（option の value = eq/ne/contains/gt/gte/lt/lte）、
//       textbox「値」、button「追加」→ onAddFilter({column, op, value})。値は入力そのまま（文字列）
//   - フィルタの検証（InvalidFilterError）は親（詳細画面）が行う。FilterBar は検証せず onAddFilter を呼ぶ
//   - 並べ替え: select「並べ替え」（option value=列名、value="" =「なし」）と select「並べ替えの向き」（asc / desc）。
//     列を選ぶと onSortChange({column, direction})（向きの既定は asc）、「なし」を選ぶと onSortChange(null)、
//     列を選んだ状態で向きを変えると onSortChange({column, direction})
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FilterBar } from "../../../src/components/analysis/FilterBar.jsx";
import { col } from "../uiAnalysisHelpers.jsx";

const COLUMNS = [
  col("店舗", "string"),
  col("売上", "number"),
  col("日付", "date"),
];

const setup = (props = {}) => {
  const handlers = {
    onAddFilter: vi.fn(),
    onRemoveFilter: vi.fn(),
    onSortChange: vi.fn(),
  };
  const user = userEvent.setup();
  render(
    <FilterBar
      columns={COLUMNS}
      filters={[]}
      sort={null}
      {...handlers}
      {...props}
    />,
  );
  return { user, ...handlers };
};

describe("FilterBar: 条件チップ", () => {
  it("条件ごとにチップ（列名と値を含む）を出す", () => {
    setup({
      filters: [
        { column: "店舗", op: "eq", value: "東京" },
        { column: "売上", op: "gte", value: "1000" },
      ],
    });
    const items = within(
      screen.getByRole("list", { name: "絞り込み条件" }),
    ).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("店舗");
    expect(items[0]).toHaveTextContent("東京");
    expect(items[1]).toHaveTextContent("売上");
    expect(items[1]).toHaveTextContent("1000");
  });

  it("条件がないときはチップを出さない", () => {
    setup();
    const list = screen.queryByRole("list", { name: "絞り込み条件" });
    if (list) expect(within(list).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("× で、押したチップの添字を onRemoveFilter に渡す", async () => {
    const { user, onRemoveFilter } = setup({
      filters: [
        { column: "店舗", op: "eq", value: "東京" },
        { column: "売上", op: "gte", value: "1000" },
      ],
    });
    const removes = screen.getAllByRole("button", { name: /削除/ });
    expect(removes).toHaveLength(2);
    await user.click(removes[1]);
    expect(onRemoveFilter).toHaveBeenCalledWith(1);
    await user.click(removes[0]);
    expect(onRemoveFilter).toHaveBeenLastCalledWith(0);
  });
});

describe("FilterBar: 条件を追加", () => {
  it("「＋条件を追加」を押すと、列・演算子・値の入力欄と「追加」が出る", async () => {
    const { user } = setup();
    expect(screen.queryByRole("textbox", { name: "値" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /条件を追加/ }));
    expect(screen.getByRole("combobox", { name: "列" })).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "演算子" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "値" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加" })).toBeInTheDocument();
  });

  it("列の選択肢は渡された列（固定の列名を持たない）", async () => {
    const { user } = setup({
      columns: [col("alpha", "number"), col("beta", "string")],
    });
    await user.click(screen.getByRole("button", { name: /条件を追加/ }));
    const options = within(
      screen.getByRole("combobox", { name: "列" }),
    ).getAllByRole("option");
    const values = options.map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(["alpha", "beta"]));
    expect(values).not.toContain("店舗");
  });

  it("演算子に eq/ne/contains/gt/gte/lt/lte を選べる", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /条件を追加/ }));
    const values = within(screen.getByRole("combobox", { name: "演算子" }))
      .getAllByRole("option")
      .map((o) => o.value);
    expect(values).toEqual(
      expect.arrayContaining([
        "eq",
        "ne",
        "contains",
        "gt",
        "gte",
        "lt",
        "lte",
      ]),
    );
  });

  it("列・演算子・値を入れて「追加」で onAddFilter({column, op, value})", async () => {
    const { user, onAddFilter } = setup();
    await user.click(screen.getByRole("button", { name: /条件を追加/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "列" }),
      "売上",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "演算子" }),
      "gte",
    );
    await user.type(screen.getByRole("textbox", { name: "値" }), "1000");
    await user.click(screen.getByRole("button", { name: "追加" }));
    expect(onAddFilter).toHaveBeenCalledTimes(1);
    expect(onAddFilter).toHaveBeenCalledWith({
      column: "売上",
      op: "gte",
      value: "1000",
    });
  });

  it("FilterBar は検証しない: 数値列に数値でない値でも onAddFilter を呼ぶ（検証は親）", async () => {
    const { user, onAddFilter } = setup();
    await user.click(screen.getByRole("button", { name: /条件を追加/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "列" }),
      "売上",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "演算子" }),
      "gt",
    );
    await user.type(screen.getByRole("textbox", { name: "値" }), "abc");
    await user.click(screen.getByRole("button", { name: "追加" }));
    expect(onAddFilter).toHaveBeenCalledWith({
      column: "売上",
      op: "gt",
      value: "abc",
    });
  });
});

describe("FilterBar: 並べ替え", () => {
  it("列を選ぶと onSortChange({column, direction:'asc'})", async () => {
    const { user, onSortChange } = setup();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "並べ替え" }),
      "売上",
    );
    expect(onSortChange).toHaveBeenCalledWith({
      column: "売上",
      direction: "asc",
    });
  });

  it("「なし」（value=空）を選ぶと onSortChange(null)", async () => {
    const { user, onSortChange } = setup({
      sort: { column: "売上", direction: "asc" },
    });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "並べ替え" }),
      "",
    );
    expect(onSortChange).toHaveBeenCalledWith(null);
  });

  it("向きを変えると onSortChange({column, direction})", async () => {
    const { user, onSortChange } = setup({
      sort: { column: "売上", direction: "asc" },
    });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "並べ替えの向き" }),
      "desc",
    );
    expect(onSortChange).toHaveBeenCalledWith({
      column: "売上",
      direction: "desc",
    });
  });

  it("渡された sort を選択状態として表示する", () => {
    setup({ sort: { column: "日付", direction: "desc" } });
    expect(screen.getByRole("combobox", { name: "並べ替え" })).toHaveValue(
      "日付",
    );
    expect(
      screen.getByRole("combobox", { name: "並べ替えの向き" }),
    ).toHaveValue("desc");
  });
});
