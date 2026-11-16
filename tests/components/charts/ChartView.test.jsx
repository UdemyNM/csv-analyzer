// 対象: src/components/charts/ChartView.jsx（名前付き export { ChartView }）
// 仕様: docs/05 5 章「グラフの種類: 棒 / 折れ線 / 円 / 散布図」「グラフは 2,000 点を上限とし、超えるときは先頭を含めて等間隔に
//       間引いて描き、グラフの下に『全 N 件のうち M 件を間引いて表示しています』と注記する」、
//       docs/05 8 章「グラフは role="img" と aria-label を付ける」、docs/03 7 章「折れ線は 101 点以上で点（dot）を描かない」
// Recharts 3 の最新ドキュメントで確認した前提:
//   - ResponsiveContainer は ResizeObserver で幅を測るため jsdom では描けない → このテストでは ResponsiveContainer を固定サイズ
//     （600x300）に差し替える（tests/components/uiAnalysisHelpers.jsx の withSizedContainer）。
//     ChartView は recharts の ResponsiveContainer を使い、直下に 1 つのチャート（BarChart / LineChart / PieChart / ScatterChart）を置くこと
//   - Line の dot={false} で点を描かない（DOM に .recharts-line-dot が出ない）。散布図の点は .recharts-scatter-symbol、棒は .recharts-bar-rectangle
// 契約（細部は本テストで固定）:
//   <ChartView type="bar"|"line"|"pie"|"scatter" rows={object[]} x="列名" y="列名" />
//   - rows の値は文字列（CSV そのまま。"1,234" 形式も数値扱い）でも数値（集計結果）でもよい。y（散布図は x も）は数値として読む
//   - グラフ全体を role="img"、aria-label に「種類（棒グラフ/折れ線グラフ/円グラフ/散布図）・x の列名・y の列名」を含める
//   - 2,000 点以下はそのまま、超えたら 2,000 点に間引き、注記を出す（ちょうど 2,000 点では注記なし）
//   - 折れ線は 100 点以下は点を描き、101 点以上は点を描かない
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChartView } from "../../../src/components/charts/ChartView.jsx";

vi.mock("recharts", async (orig) =>
  (await import("../uiAnalysisHelpers.jsx")).withSizedContainer(await orig()),
);

// 2,000 点の描画は jsdom では数秒かかることがある
vi.setConfig({ testTimeout: 30000 });

const rowsOf = (n) =>
  Array.from({ length: n }, (_, i) => ({
    label: `L${i + 1}`,
    value: String(i + 1),
  }));
const symbols = (container) =>
  container.querySelectorAll(".recharts-scatter-symbol");

describe("ChartView: 種類とアクセシビリティ", () => {
  it.each([
    ["bar", /棒グラフ/],
    ["line", /折れ線グラフ/],
    ["pie", /円グラフ/],
    ["scatter", /散布図/],
  ])(
    "%s は role=img で、aria-label に種類・x・y の列名を含む",
    (type, label) => {
      render(<ChartView type={type} rows={rowsOf(5)} x="label" y="value" />);
      const img = screen.getByRole("img");
      expect(img.getAttribute("aria-label")).toMatch(label);
      expect(img.getAttribute("aria-label")).toContain("label");
      expect(img.getAttribute("aria-label")).toContain("value");
    },
  );

  it("棒グラフは行ごとに棒を描く", () => {
    const { container } = render(
      <ChartView type="bar" rows={rowsOf(5)} x="label" y="value" />,
    );
    expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(
      5,
    );
  });

  it("折れ線・円・散布図も描く（散布図は x・y とも数値として読む）", () => {
    const line = render(
      <ChartView type="line" rows={rowsOf(5)} x="label" y="value" />,
    );
    expect(line.container.querySelector(".recharts-line")).not.toBeNull();
    line.unmount();

    const pie = render(
      <ChartView type="pie" rows={rowsOf(5)} x="label" y="value" />,
    );
    expect(pie.container.querySelector(".recharts-pie")).not.toBeNull();
    pie.unmount();

    const scatter = render(
      <ChartView
        type="scatter"
        rows={[
          { px: "1,000", py: "2" },
          { px: "2,000", py: "4" },
          { px: "3,000", py: "6" },
        ]}
        x="px"
        y="py"
      />,
    );
    expect(symbols(scatter.container)).toHaveLength(3);
  });

  it("集計結果のような数値の値（文字列でない）も描ける", () => {
    const { container } = render(
      <ChartView
        type="bar"
        rows={[
          { 店舗: "東京", 売上_sum: 1500 },
          { 店舗: "大阪", 売上_sum: 3500 },
        ]}
        x="店舗"
        y="売上_sum"
      />,
    );
    expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(
      2,
    );
  });
});

describe("ChartView: 折れ線の点（dot）", () => {
  it("100 点までは点を描く", () => {
    const { container } = render(
      <ChartView type="line" rows={rowsOf(100)} x="label" y="value" />,
    );
    expect(container.querySelectorAll(".recharts-line-dot")).toHaveLength(100);
  });

  it("101 点以上は点を描かない（線だけ）", () => {
    const { container } = render(
      <ChartView type="line" rows={rowsOf(101)} x="label" y="value" />,
    );
    expect(container.querySelector(".recharts-line")).not.toBeNull();
    expect(container.querySelectorAll(".recharts-line-dot")).toHaveLength(0);
  });
});

describe("ChartView: 2,000 点の間引きと注記", () => {
  const scatterRows = (n) =>
    Array.from({ length: n }, (_, i) => ({
      px: String(i),
      // 先頭 2,000 件だけを切り取ったのか、全体から等間隔に取ったのかを見分けるため、後半だけ y を変える
      py: i < 2000 ? "0" : "100",
    }));

  it("ちょうど 2,000 点は全部描き、注記は出さない", () => {
    const { container } = render(
      <ChartView type="scatter" rows={scatterRows(2000)} x="px" y="py" />,
    );
    expect(symbols(container)).toHaveLength(2000);
    expect(screen.queryByText(/間引いて表示/)).toBeNull();
  });

  it("2,001 点は 2,000 点に間引き、「全 2001 件のうち 2000 件を間引いて表示しています」と注記する", () => {
    const { container } = render(
      <ChartView type="scatter" rows={scatterRows(2001)} x="px" y="py" />,
    );
    expect(symbols(container)).toHaveLength(2000);
    expect(
      screen.getByText(
        /全\s*2,?001\s*件のうち\s*2,?000\s*件を間引いて表示しています/,
      ),
    ).toBeInTheDocument();
  });

  it("3,000 点は 2,000 点に間引き、先頭の点を含み、後半からも等間隔に取る（先頭 2,000 件の切り取りではない）", () => {
    const { container } = render(
      <ChartView type="scatter" rows={scatterRows(3000)} x="px" y="py" />,
    );
    const list = [...symbols(container)].map((g) => {
      const p = g.querySelector("path");
      return {
        cx: Number(p.getAttribute("cx")),
        cy: Number(p.getAttribute("cy")),
      };
    });
    expect(list).toHaveLength(2000);
    expect(
      screen.getByText(
        /全\s*3,?000\s*件のうち\s*2,?000\s*件を間引いて表示しています/,
      ),
    ).toBeInTheDocument();
    // 先頭の点（px=0）は x の最小位置
    expect(list[0].cx).toBe(Math.min(...list.map((p) => p.cx)));
    // 後半（py=100）の行が含まれていれば、y の位置が 2 種類になる
    expect(new Set(list.map((p) => p.cy)).size).toBeGreaterThan(1);
    // 等間隔: 隣り合う点の間隔の最大が最小の 2.5 倍以内（1 件おきと 2 件おきが混ざる程度）
    const gaps = list.slice(1).map((p, i) => p.cx - list[i].cx);
    expect(Math.min(...gaps)).toBeGreaterThan(0);
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(2.5);
  });
});
