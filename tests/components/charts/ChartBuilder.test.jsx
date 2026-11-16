// 対象: src/components/charts/ChartBuilder.jsx（ピボットグラフ。設計書 8 章）
// 契約:
//   <ChartBuilder columns chart pivot result filteredRows onChartChange(chart) onMove(move) onPivotChange(pivot) />
//   （FieldDndProvider の中で使う）
//   - 種類はボタン 4 つ（棒・折れ線・円・散布図。aria-pressed）。chart が null なら棒
//   - 棒・折れ線・円: 「X軸」「系列」「Y軸」の枠 = 集計の行・列・値（onMove の slot は rows / columns / values）
//   - 散布図: 「X軸」「Y軸」の枠（scatterX / scatterY。数値の列だけ選べる）。描くのは filteredRows
//   - 注記: 系列が 8 を超えたら / 円で系列が 2 つ以上なら。値が無い・散布図の軸が揃わないときは案内文
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartBuilder } from "../../../src/components/charts/ChartBuilder.jsx";
import { FieldDndProvider } from "../../../src/components/dnd/FieldDnd.jsx";
import { pivot as runPivot } from "../../../src/utils/pivot.js";
import { col } from "../../components/uiAnalysisHelpers.jsx";

vi.mock("recharts", async (orig) =>
  (await import("../uiAnalysisHelpers.jsx")).withSizedContainer(await orig()),
);

const COLUMNS = [
  col("店舗", "string"),
  col("商品", "string"),
  col("数量", "number"),
  col("売上", "number"),
];
const ROWS = [
  { 店舗: "東京", 商品: "りんご", 数量: "1", 売上: "1000" },
  { 店舗: "東京", 商品: "みかん", 数量: "2", 売上: "500" },
  { 店舗: "大阪", 商品: "りんご", 数量: "3", 売上: "2000" },
];
const typeOf = (name) => COLUMNS.find((c) => c.name === name)?.type ?? "string";
const PIVOT = {
  rows: ["店舗"],
  columns: [],
  values: [{ column: "売上", fn: "sum" }],
};

function setup({ chart = null, pivot = PIVOT, rows = ROWS } = {}) {
  const onChartChange = vi.fn();
  const onMove = vi.fn();
  const onPivotChange = vi.fn();
  const utils = render(
    <FieldDndProvider onMove={onMove}>
      <ChartBuilder
        columns={COLUMNS}
        chart={chart}
        pivot={pivot}
        result={runPivot(rows, pivot, typeOf)}
        filteredRows={rows}
        onChartChange={onChartChange}
        onMove={onMove}
        onPivotChange={onPivotChange}
      />
    </FieldDndProvider>,
  );
  return {
    user: userEvent.setup(),
    onChartChange,
    onMove,
    onPivotChange,
    ...utils,
  };
}

const typeButton = (name) =>
  within(screen.getByRole("group", { name: "グラフの種類" })).getByRole(
    "button",
    { name },
  );

describe("ChartBuilder: 種類", () => {
  it("chart が null なら棒が押された状態。折れ線を押すと onChartChange", async () => {
    const { user, onChartChange } = setup();
    expect(typeButton("棒")).toHaveAttribute("aria-pressed", "true");
    expect(typeButton("折れ線")).toHaveAttribute("aria-pressed", "false");
    await user.click(typeButton("折れ線"));
    expect(onChartChange).toHaveBeenCalledWith({ type: "line", scatter: null });
  });

  it("散布図から棒に戻しても scatter は残す", async () => {
    const { user, onChartChange } = setup({
      chart: { type: "scatter", scatter: { x: "数量", y: "売上" } },
    });
    await user.click(typeButton("棒"));
    expect(onChartChange).toHaveBeenCalledWith({
      type: "bar",
      scatter: { x: "数量", y: "売上" },
    });
  });
});

describe("ChartBuilder: 共通の枠（集計の行・列・値）", () => {
  it("X軸・系列・Y軸の枠があり、集計の設定が出ている", () => {
    setup();
    expect(
      within(screen.getByRole("group", { name: "X軸" })).getByText("店舗"),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "系列" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Y軸" })).getByText(
        "売上・合計",
      ),
    ).toBeInTheDocument();
  });

  it("X軸の「＋」で商品 → onMove（集計の rows と同じ）", async () => {
    const { user, onMove } = setup();
    await user.click(screen.getByRole("button", { name: "X軸に列を追加" }));
    await user.click(
      within(screen.getByRole("list", { name: "X軸に追加する列" })).getByRole(
        "button",
        {
          name: "商品",
        },
      ),
    );
    expect(onMove).toHaveBeenCalledWith({
      field: "商品",
      from: null,
      to: { slot: "rows" },
    });
  });

  it("集計の結果からグラフを描く（role=img、X軸は行の列名）", () => {
    setup();
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "棒グラフ: X軸 店舗、系列 売上・合計",
    );
  });

  it("値が無いときは案内文", () => {
    setup({ pivot: { rows: ["店舗"], columns: [], values: [] } });
    expect(
      screen.getByText("Y軸（集計の値）に列を置くと、グラフを表示します"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("ChartBuilder: 注記", () => {
  it("系列が 9 つなら「先頭 8 系列だけ」", () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({
      店舗: "東京",
      商品: `p${i}`,
      数量: "1",
      売上: "1",
    }));
    setup({
      rows,
      pivot: {
        rows: ["店舗"],
        columns: ["商品"],
        values: [{ column: "売上", fn: "sum" }],
      },
    });
    expect(
      screen.getByText(
        "系列が多いため、先頭 8 系列だけを描いています（全 9 系列）",
      ),
    ).toBeInTheDocument();
  });

  it("円で系列が 2 つ以上なら「最初の系列だけ」", () => {
    setup({
      chart: { type: "pie", scatter: null },
      pivot: {
        rows: ["店舗"],
        columns: ["商品"],
        values: [{ column: "売上", fn: "sum" }],
      },
    });
    expect(
      screen.getByText("円グラフは最初の系列（みかん）だけを描いています"),
    ).toBeInTheDocument();
  });
});

describe("ChartBuilder: 散布図", () => {
  it("X/Y の枠になり、「＋」では数値の列だけ選べる", async () => {
    const { user, onMove } = setup({
      chart: { type: "scatter", scatter: null },
    });
    expect(
      screen.queryByRole("group", { name: "系列" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "X軸に列を追加" }));
    const list = screen.getByRole("list", { name: "X軸に追加する列" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["数量", "売上"]);
    await user.click(within(list).getByRole("button", { name: "数量" }));
    expect(onMove).toHaveBeenCalledWith({
      field: "数量",
      from: null,
      to: { slot: "scatterX" },
    });
  });

  it("X/Y が揃わないときは案内文", () => {
    setup({ chart: { type: "scatter", scatter: { x: "数量", y: "" } } });
    expect(
      screen.getByText("X軸とY軸に数値の列を置くと、散布図を表示します"),
    ).toBeInTheDocument();
  });

  it("X/Y が揃えば元の行で散布図を描く", () => {
    setup({ chart: { type: "scatter", scatter: { x: "数量", y: "売上" } } });
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "散布図: X軸 数量、Y軸 売上",
    );
  });

  it("散布図の軸の × で onMove（scatterX から外す）", async () => {
    const { user, onMove } = setup({
      chart: { type: "scatter", scatter: { x: "数量", y: "売上" } },
    });
    await user.click(
      screen.getByRole("button", { name: "X軸から「数量」を外す" }),
    );
    expect(onMove).toHaveBeenCalledWith({
      field: "数量",
      from: { slot: "scatterX", index: 0 },
      to: null,
    });
  });
});
