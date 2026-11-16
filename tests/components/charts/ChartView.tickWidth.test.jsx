// 対象: src/components/charts/ChartView.jsx（点が多い棒・折れ線の X 軸ラベルの数は、チャートの幅で決める）
// 背景: 数値 interval でラベルを間引くと文字幅の計測を省けるが、固定の個数だと
//       スマホ幅（375px）でラベルが重なる／PC 幅で少なすぎる。ResponsiveContainer の onResize で幅を受け取り、
//       「1 ラベルの幅の目安（8px × 文字数、全角は 2 文字ぶん）＋余白」で何個置けるかを決める（最小 2・最大 8）。
//       幅が分かるまで（最初の描画）は最小の 2 個。
// 契約:
//   - ChartView は ResponsiveContainer に onResize を渡す（101 点以上の棒・折れ線のとき）
//   - 日付 10 文字（80px + 余白 12px = 92px/個）: 幅 300px → 2 個、幅 1000px → 8 個
//   - 幅が変わったら、ラベルの数も変わる
//   - 100 点以下は Recharts の自動のまま（幅を追わない）
import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { ChartView } from "../../../src/components/charts/ChartView.jsx";

const bus = vi.hoisted(() => ({ width: 1000, listeners: new Set() }));

vi.mock("recharts", async (orig) => {
  const actual = await orig();
  const React = await import("react");
  return {
    ...actual,
    // 実物と同じく、マウント直後と幅が変わったときに onResize(width, height) を呼ぶ固定サイズのコンテナ
    ResponsiveContainer: ({ children, onResize }) => {
      const [width, setWidth] = React.useState(bus.width);
      const latest = React.useRef(onResize);
      latest.current = onResize;
      React.useEffect(() => {
        latest.current?.(width, 300);
      }, [width]);
      React.useEffect(() => {
        bus.listeners.add(setWidth);
        return () => bus.listeners.delete(setWidth);
      }, []);
      return React.cloneElement(children, { width, height: 300 });
    },
  };
});
vi.setConfig({ testTimeout: 30000 });

const dateRows = (n) =>
  Array.from({ length: n }, (_, i) => ({
    day: new Date(Date.UTC(2024, 0, 1) + i * 86400000)
      .toISOString()
      .slice(0, 10),
    value: String(i + 1),
  }));
const xTicks = (container) =>
  container.querySelectorAll(".recharts-xAxis .recharts-cartesian-axis-tick");

function renderAt(width, props) {
  bus.width = width;
  return render(<ChartView type="bar" x="day" y="value" {...props} />);
}

describe("ChartView: X 軸のラベル数はチャートの幅で決める", () => {
  it.each(["bar", "line"])(
    "%s: 幅 300px（スマホ）は 2 個、幅 1000px（PC）は 8 個",
    (type) => {
      const narrow = renderAt(300, { type, rows: dateRows(500) });
      expect(xTicks(narrow.container)).toHaveLength(2);
      narrow.unmount();

      const wide = renderAt(1000, { type, rows: dateRows(500) });
      expect(xTicks(wide.container)).toHaveLength(8);
    },
  );

  it("幅が変わったら、ラベルの数も変わる", () => {
    const { container } = renderAt(1000, { rows: dateRows(500) });
    expect(xTicks(container)).toHaveLength(8);

    act(() => bus.listeners.forEach((set) => set(300)));
    expect(xTicks(container)).toHaveLength(2);

    act(() => bus.listeners.forEach((set) => set(700)));
    // (700 - 80) / 92 = 6.7 → 6 個
    expect(xTicks(container)).toHaveLength(6);
  });

  it("全角のラベルは 1 文字を 2 文字ぶんの幅として数える（長い名前ほど少なくなる）", () => {
    const rows = Array.from({ length: 300 }, (_, i) => ({
      day: `東京都新宿区${String(i).padStart(3, "0")}`, // 全角 6 + 半角 3 → 15 文字ぶん = 120px + 12px
      value: String(i + 1),
    }));
    const { container } = renderAt(1000, { rows });
    // (1000 - 80) / 132 = 6.96 → 6 個
    expect(xTicks(container)).toHaveLength(6);
  });

  it("100 点以下は、幅を追わず自動のまま（onResize を渡さない）", () => {
    const { container } = renderAt(300, { rows: dateRows(100) });
    // 自動（preserveEnd）。jsdom は文字幅 0 なので、最小間隔（5px）だけで決まり、2 個よりずっと多く残る
    expect(xTicks(container).length).toBeGreaterThan(10);
  });
});
