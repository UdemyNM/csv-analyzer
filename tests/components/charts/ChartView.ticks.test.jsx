// 対象: src/components/charts/ChartView.jsx（棒・折れ線の X 軸の目盛り）
// 背景（計測。本番ビルド・Chromium・25 万行の集計結果を 2,000 点に間引いた棒/折れ線）:
//   Recharts の X 軸は、目盛りの重なりを避けるため、目盛り（= 点）ごとに文字幅を DOM で測る
//   （1 点ごとに強制レイアウト）。2,000 点だと 1.2〜1.4 秒、メインスレッドが止まる。
//   → 点が多い（100 点を超える）棒・折れ線は、目盛りを数値 interval で間引いて、文字幅の計測を省く。
// 契約:
//   - 100 点以下: これまでどおり Recharts の自動（重なりを避けて間引く）に任せる
//   - 101 点以上の棒・折れ線: X 軸のラベルを 3 個前後に間引く（先頭を含む。375px 幅でも日付が重ならない数）。点・棒そのものは間引かない
//   - 散布図・円は X 軸の目盛りの扱いを変えない
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ChartView } from "../../../src/components/charts/ChartView.jsx";

vi.mock("recharts", async (orig) =>
  (await import("../uiAnalysisHelpers.jsx")).withSizedContainer(await orig()),
);
vi.setConfig({ testTimeout: 30000 });

const rowsOf = (n) =>
  Array.from({ length: n }, (_, i) => ({
    label: `L${i + 1}`,
    value: String(i + 1),
  }));
const xTicks = (container) =>
  container.querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick");

describe("ChartView: 点が多いときの X 軸の目盛り", () => {
  it.each(["bar", "line"])(
    "%s: 100 点以下は自動のまま（目盛りを固定で間引かない）",
    (type) => {
      const { container } = render(
        <ChartView type={type} rows={rowsOf(100)} x="label" y="value" />,
      );
      // jsdom は文字幅が 0 なので、自動（preserveEnd）ならすべての目盛りが残る
      expect(xTicks(container).length).toBeGreaterThan(50);
    },
  );

  it.each(["bar", "line"])(
    "%s: 101 点以上は X 軸のラベルを間引く（先頭の点は残す）",
    (type) => {
      const { container } = render(
        <ChartView type={type} rows={rowsOf(500)} x="label" y="value" />,
      );
      const ticks = xTicks(container);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(6);
      // 先頭の点の目盛りは、軸の左端（プロットの左端）にある（jsdom は文字を描かないので位置で確かめる）
      const line = ticks[0].querySelector("line");
      const offset = Number(line.getAttribute("x1")) - Number(line.getAttribute("x"));
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(5); // 棒は帯の中央（帯の幅の半分）だけ右
    },
  );

  it("101 点以上でも、棒そのものは間引かない（全点を描く）", () => {
    const { container } = render(
      <ChartView type="bar" rows={rowsOf(500)} x="label" y="value" />,
    );
    expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(
      500,
    );
  });

  it("2,000 点を超えても、ラベルの間引きは 2,000 点のうえで行う（注記は従来どおり）", () => {
    const { container } = render(
      <ChartView type="line" rows={rowsOf(2500)} x="label" y="value" />,
    );
    expect(xTicks(container).length).toBeLessThanOrEqual(6);
    expect(container.querySelector(".chart__note")?.textContent).toContain(
      "2,000 件を間引いて表示",
    );
  });
});
