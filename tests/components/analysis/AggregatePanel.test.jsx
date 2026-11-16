// 対象: src/components/analysis/AggregatePanel.jsx（名前付き export { AggregatePanel }）
// 仕様: docs/03 1 章「集計（グループ化・指標＋集計結果の表）」、docs/05 3・5 章
//       「集計セクションは、グループ化・指標の選択と、集計結果の表（1 ページ 100 行のページング）を持つ」
// 契約（細部は本テストで固定）:
//   <AggregatePanel columns={[{name,type}]} aggregation={{groupBy:string[], metrics:{column?,fn}[]}|null}
//                   resultRows={object[]} onAggregationChange={(aggregation|null)=>void} />
//   - 集計の計算は親（詳細画面）が行い、結果を resultRows で渡す（グラフも同じ結果を使うため）
//   - グループ化: <fieldset> role="group" 名前「グループ化」の中に、列ごとのチェックボックス（名前=列名）
//       チェックで onAggregationChange({groupBy:[...], metrics:[既存]})、全部外して指標も無ければ null
//   - 指標の追加: select「指標の列」（value=列名）、select「集計関数」（value = sum/avg/count/min/max）、button「指標を追加」
//       → onAggregationChange({groupBy:[既存], metrics:[...既存, {column, fn}]})。fn=count は {fn:'count'}（column は無くてもよい）
//   - 追加済みの指標は <ul aria-label="指標"> の <li>。各 li の button（名前に「削除」と出力名 例 売上_sum を含む）で外す。
//       groupBy も指標も空になったら null
//   - 集計結果は DataTable（名前「集計結果」の region・1 ページ 100 行）。aggregation が null のときは出さない
//   - 結果の列は、groupBy の列 → 各指標の出力名（<column>_<fn>、count は count）の順
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AggregatePanel } from "../../../src/components/analysis/AggregatePanel.jsx";
import { col } from "../uiAnalysisHelpers.jsx";

const COLUMNS = [
  col("店舗", "string"),
  col("商品", "string"),
  col("売上", "number"),
];

const setup = (props = {}) => {
  const onAggregationChange = vi.fn();
  const user = userEvent.setup();
  const utils = render(
    <AggregatePanel
      columns={COLUMNS}
      aggregation={null}
      resultRows={[]}
      onAggregationChange={onAggregationChange}
      {...props}
    />,
  );
  return { user, onAggregationChange, ...utils };
};

const group = () => screen.getByRole("group", { name: "グループ化" });

describe("AggregatePanel: グループ化", () => {
  it("列ごとのチェックボックスを出す（列名を固定しない）", () => {
    setup({ columns: [col("alpha", "string"), col("beta", "number")] });
    expect(
      within(group()).getByRole("checkbox", { name: "alpha" }),
    ).toBeInTheDocument();
    expect(
      within(group()).getByRole("checkbox", { name: "beta" }),
    ).toBeInTheDocument();
    expect(
      within(group()).queryByRole("checkbox", { name: "店舗" }),
    ).toBeNull();
  });

  it("チェックすると groupBy に加えて onAggregationChange", async () => {
    const { user, onAggregationChange } = setup();
    await user.click(within(group()).getByRole("checkbox", { name: "店舗" }));
    expect(onAggregationChange).toHaveBeenCalledWith({
      groupBy: ["店舗"],
      metrics: [],
    });
  });

  it("既存の groupBy / metrics を保ったまま列を足す", async () => {
    const { user, onAggregationChange } = setup({
      aggregation: {
        groupBy: ["店舗"],
        metrics: [{ column: "売上", fn: "sum" }],
      },
    });
    expect(
      within(group()).getByRole("checkbox", { name: "店舗" }),
    ).toBeChecked();
    await user.click(within(group()).getByRole("checkbox", { name: "商品" }));
    expect(onAggregationChange).toHaveBeenCalledWith({
      groupBy: ["店舗", "商品"],
      metrics: [{ column: "売上", fn: "sum" }],
    });
  });

  it("グループ化の列も指標も無くなったら null", async () => {
    const { user, onAggregationChange } = setup({
      aggregation: { groupBy: ["店舗"], metrics: [] },
    });
    await user.click(within(group()).getByRole("checkbox", { name: "店舗" }));
    expect(onAggregationChange).toHaveBeenCalledWith(null);
  });
});

describe("AggregatePanel: 指標", () => {
  it("列と関数を選んで「指標を追加」で metrics に足す", async () => {
    const { user, onAggregationChange } = setup({
      aggregation: { groupBy: ["店舗"], metrics: [] },
    });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "指標の列" }),
      "売上",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "集計関数" }),
      "sum",
    );
    await user.click(screen.getByRole("button", { name: "指標を追加" }));
    expect(onAggregationChange).toHaveBeenCalledWith({
      groupBy: ["店舗"],
      metrics: [{ column: "売上", fn: "sum" }],
    });
  });

  it("関数は sum/avg/count/min/max を選べる", () => {
    setup();
    const values = within(screen.getByRole("combobox", { name: "集計関数" }))
      .getAllByRole("option")
      .map((o) => o.value);
    expect(values).toEqual(
      expect.arrayContaining(["sum", "avg", "count", "min", "max"]),
    );
  });

  it("count を追加すると {fn:'count'}", async () => {
    const { user, onAggregationChange } = setup({
      aggregation: { groupBy: ["店舗"], metrics: [] },
    });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "集計関数" }),
      "count",
    );
    await user.click(screen.getByRole("button", { name: "指標を追加" }));
    expect(onAggregationChange).toHaveBeenCalledTimes(1);
    const arg = onAggregationChange.mock.calls[0][0];
    expect(arg.groupBy).toEqual(["店舗"]);
    expect(arg.metrics).toHaveLength(1);
    expect(arg.metrics[0]).toEqual(expect.objectContaining({ fn: "count" }));
  });

  it("追加済みの指標を出力名で表示し、削除で外す", async () => {
    const { user, onAggregationChange } = setup({
      aggregation: {
        groupBy: ["店舗"],
        metrics: [
          { column: "売上", fn: "sum" },
          { column: "売上", fn: "avg" },
        ],
      },
    });
    const list = screen.getByRole("list", { name: "指標" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list).toHaveTextContent("売上_sum");
    expect(list).toHaveTextContent("売上_avg");
    await user.click(within(list).getByRole("button", { name: /売上_sum/ }));
    expect(onAggregationChange).toHaveBeenCalledWith({
      groupBy: ["店舗"],
      metrics: [{ column: "売上", fn: "avg" }],
    });
  });

  it("最後の指標を外し、groupBy も空なら null", async () => {
    const { user, onAggregationChange } = setup({
      aggregation: { groupBy: [], metrics: [{ column: "売上", fn: "sum" }] },
    });
    await user.click(
      within(screen.getByRole("list", { name: "指標" })).getByRole("button", {
        name: /削除/,
      }),
    );
    expect(onAggregationChange).toHaveBeenCalledWith(null);
  });
});

describe("AggregatePanel: 集計結果の表", () => {
  const aggregation = {
    groupBy: ["店舗"],
    metrics: [{ column: "売上", fn: "sum" }],
  };

  it("aggregation が null のときは結果の表を出さない", () => {
    setup();
    expect(screen.queryByRole("region", { name: "集計結果" })).toBeNull();
  });

  it("結果を、groupBy → 出力名の列順で表にする", () => {
    setup({
      aggregation,
      resultRows: [
        { 店舗: "東京", 売上_sum: 1500 },
        { 店舗: "大阪", 売上_sum: 3500 },
      ],
    });
    const box = screen.getByRole("region", { name: "集計結果" });
    const headers = within(box)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual(["店舗", "売上_sum"]);
    const rows = within(box)
      .getAllByRole("row")
      .filter((r) => within(r).queryAllByRole("columnheader").length === 0);
    expect(rows).toHaveLength(2);
    expect(
      within(rows[1])
        .getAllByRole("cell")
        .map((c) => c.textContent.replace(/,/g, "")),
    ).toEqual(["大阪", "3500"]);
  });

  it("グループが多いときは 1 ページ 100 行でページングする", async () => {
    const user = userEvent.setup();
    const resultRows = Array.from({ length: 250 }, (_, i) => ({
      店舗: `店${i + 1}`,
      売上_sum: i + 1,
    }));
    render(
      <AggregatePanel
        columns={COLUMNS}
        aggregation={aggregation}
        resultRows={resultRows}
        onAggregationChange={() => {}}
      />,
    );
    const box = screen.getByRole("region", { name: "集計結果" });
    const bodyCount = () =>
      within(box)
        .getAllByRole("row")
        .filter((r) => within(r).queryAllByRole("columnheader").length === 0)
        .length;
    expect(bodyCount()).toBe(100);
    expect(screen.queryByText("店101")).toBeNull();
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByText("店101")).toBeInTheDocument();
    expect(bodyCount()).toBe(100);
  });
});
