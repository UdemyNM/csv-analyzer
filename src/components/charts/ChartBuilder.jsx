import { ChartView } from "./ChartView.jsx";

const TYPES = [
  ["bar", "棒"],
  ["line", "折れ線"],
  ["pie", "円"],
  ["scatter", "散布図"],
];

/**
 * グラフの種類と軸を選ぶ部品と、グラフ本体。
 * 元データ（rows）と軸の選択肢（xOptions / yOptions）は親が決めて渡す（集計の有無で変わる）。
 * chart の軸が選択肢にないとき（集計を外して軸が消えた など）は、グラフを描かない。
 *
 * @param {{rows: object[], xOptions: string[], yOptions: string[],
 *   chart: {type: string, x: string, y: string} | null, onChartChange: Function}} props
 */
export function ChartBuilder({
  rows,
  xOptions,
  yOptions,
  chart,
  onChartChange,
}) {
  const type = chart?.type ?? "bar";
  const x = xOptions.includes(chart?.x) ? chart.x : "";
  const y = yOptions.includes(chart?.y) ? chart.y : "";
  const change = (patch) =>
    onChartChange({
      type,
      x: chart?.x ?? "",
      y: chart?.y ?? "",
      ...patch,
    });

  return (
    <div className="chart-builder">
      <div className="control-row">
        <label className="inline-field">
          <span>種類</span>
          <select
            className="input"
            aria-label="グラフの種類"
            value={type}
            onChange={(e) => change({ type: e.target.value })}
          >
            {TYPES.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          <span>X軸</span>
          <select
            className="input"
            aria-label="X軸"
            value={x}
            onChange={(e) => change({ x: e.target.value })}
          >
            <option value="">未選択</option>
            {xOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          <span>Y軸</span>
          <select
            className="input"
            aria-label="Y軸"
            value={y}
            onChange={(e) => change({ y: e.target.value })}
          >
            <option value="">未選択</option>
            {yOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {x !== "" && y !== "" ? (
        <ChartView type={type} rows={rows} x={x} y={y} />
      ) : (
        <p className="muted">X軸とY軸を選ぶと、グラフを表示します。</p>
      )}
    </div>
  );
}
