// 対象: src/components/charts/ChartBuilder.jsx（名前付き export { ChartBuilder }）
// 仕様: docs/03 1・7 章「グラフ（軸・種類の選択つき）」「集計があるとき、グラフの元データは集計結果（X軸の選択肢は groupBy の列と
//       指標の出力名、Y軸は指標の出力名）。集計を外して軸が消えたら、グラフは描かない」、docs/05 2・8 章
// 契約（細部は本テストで固定）:
//   <ChartBuilder rows={object[]} xOptions={string[]} yOptions={string[]}
//                 chart={{type,x,y}|null} onChartChange={(chart)=>void} />
//   - 元データ rows と、軸の選択肢（xOptions / yOptions）は親（詳細画面）が決めて渡す（集計の有無で変わる）
//   - select「グラフの種類」（value = bar/line/pie/scatter。表示は 棒/折れ線/円/散布図）、select「X軸」、select「Y軸」
//     （option の value = 列名。value="" の「未選択」を含めてよい）
//   - 変更すると onChartChange({type, x, y}) に、現在の chart と変更後の値を合わせた全体を渡す（chart が null のときの type は既定 'bar'、未選択の軸は ''）
//   - chart の x が xOptions に、y が yOptions にあるときだけ ChartView（role=img）を描く。無いときは描かない
//   - ChartView は recharts の ResponsiveContainer を使う（このテストでは固定サイズに差し替え）
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartBuilder } from "../../../src/components/charts/ChartBuilder.jsx";

vi.mock("recharts", async (orig) =>
  (await import("../uiAnalysisHelpers.jsx")).withSizedContainer(await orig()),
);

const ROWS = [
  { 店舗: "東京", 売上: "1000" },
  { 店舗: "大阪", 売上: "2000" },
  { 店舗: "名古屋", 売上: "800" },
];

const setup = (props = {}) => {
  const onChartChange = vi.fn();
  const user = userEvent.setup();
  const utils = render(
    <ChartBuilder
      rows={ROWS}
      xOptions={["店舗", "売上"]}
      yOptions={["売上"]}
      chart={{ type: "bar", x: "店舗", y: "売上" }}
      onChartChange={onChartChange}
      {...props}
    />,
  );
  return { user, onChartChange, ...utils };
};

const optionValues = (name) =>
  within(screen.getByRole("combobox", { name }))
    .getAllByRole("option")
    .map((o) => o.value);

describe("ChartBuilder: 選択肢", () => {
  it("グラフの種類に 棒/折れ線/円/散布図 を選べる", () => {
    setup();
    expect(optionValues("グラフの種類")).toEqual(
      expect.arrayContaining(["bar", "line", "pie", "scatter"]),
    );
  });

  it("X軸・Y軸の選択肢は、渡された xOptions / yOptions", () => {
    setup({
      xOptions: ["店舗", "売上_sum"],
      yOptions: ["売上_sum"],
      chart: null,
    });
    expect(optionValues("X軸")).toEqual(
      expect.arrayContaining(["店舗", "売上_sum"]),
    );
    expect(optionValues("Y軸")).toContain("売上_sum");
    expect(optionValues("Y軸")).not.toContain("店舗");
  });

  it("渡された chart を選択状態として表示する", () => {
    setup({ chart: { type: "line", x: "店舗", y: "売上" } });
    expect(screen.getByRole("combobox", { name: "グラフの種類" })).toHaveValue(
      "line",
    );
    expect(screen.getByRole("combobox", { name: "X軸" })).toHaveValue("店舗");
    expect(screen.getByRole("combobox", { name: "Y軸" })).toHaveValue("売上");
  });
});

describe("ChartBuilder: 変更", () => {
  it("種類を変えると、軸はそのままで onChartChange", async () => {
    const { user, onChartChange } = setup();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "グラフの種類" }),
      "line",
    );
    expect(onChartChange).toHaveBeenCalledWith({
      type: "line",
      x: "店舗",
      y: "売上",
    });
  });

  it("X軸・Y軸を変えると onChartChange", async () => {
    const { user, onChartChange } = setup({
      xOptions: ["店舗", "商品"],
      yOptions: ["売上", "数量"],
    });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "X軸" }),
      "商品",
    );
    expect(onChartChange).toHaveBeenLastCalledWith({
      type: "bar",
      x: "商品",
      y: "売上",
    });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Y軸" }),
      "数量",
    );
    expect(onChartChange).toHaveBeenLastCalledWith({
      type: "bar",
      x: "店舗",
      y: "数量",
    });
  });

  it("chart が null のとき X軸を選ぶと、x を持つ chart を渡す", async () => {
    const { user, onChartChange } = setup({ chart: null });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "X軸" }),
      "店舗",
    );
    expect(onChartChange).toHaveBeenCalledTimes(1);
    expect(onChartChange.mock.calls[0][0]).toEqual(
      expect.objectContaining({ x: "店舗" }),
    );
  });
});

describe("ChartBuilder: 描画", () => {
  it("軸が選択肢にあるとき、グラフ（role=img）を描く", () => {
    setup();
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("chart が null（軸が未選択）のときは描かない", () => {
    setup({ chart: null });
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("X軸が選択肢にない（集計を外して軸が消えた）ときは描かない", () => {
    setup({
      xOptions: ["店舗"],
      yOptions: ["売上"],
      chart: { type: "bar", x: "店舗", y: "売上_sum" },
    });
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("Y軸が選択肢にないときも描かない", () => {
    setup({
      xOptions: ["店舗", "売上_sum"],
      yOptions: ["売上"],
      chart: { type: "bar", x: "売上_sum", y: "売上_sum" },
    });
    expect(screen.queryByRole("img")).toBeNull();
  });
});
