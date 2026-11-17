import { pivotSeries, SERIES_LIMIT } from "../../utils/pivot.js";
import { PivotSlots } from "../analysis/PivotPanel.jsx";
import { FieldSlot } from "../dnd/FieldDnd.jsx";
import { ChartView } from "./ChartView.jsx";

const TYPES = [
  ["bar", "棒"],
  ["line", "折れ線"],
  ["pie", "円"],
  ["scatter", "散布図"],
];
const CHART_LABELS = { rows: "X軸", columns: "系列", values: "Y軸" };

/**
 * ピボットグラフ（設計書 8 章）。
 * - 棒・折れ線・円: X軸・系列・Y軸の枠は、集計の行・列・値と同じもの（PivotSlots）。描くのは集計の結果（result）
 * - 散布図: 集計とは別の X/Y（数値の列だけ）。描くのは絞り込み後の元の行（filteredRows）
 * chart: { type, scatter: { x, y } | null } | null（null は棒）
 */
export function ChartBuilder({
  columns,
  chart,
  pivot,
  result,
  filteredRows,
  onChartChange,
  onMove,
  onPivotChange,
}) {
  const type = chart?.type ?? "bar";
  const scatter = chart?.scatter ?? null;

  return (
    <div className="chart-builder">
      <div className="chart-types" role="group" aria-label="グラフの種類">
        {TYPES.map(([value, text]) => (
          <button
            key={value}
            type="button"
            className="btn chart-types__button"
            aria-pressed={type === value}
            onClick={() => onChartChange({ type: value, scatter })}
          >
            {text}
          </button>
        ))}
      </div>
      {type === "scatter" ? (
        <ScatterPart
          columns={columns}
          scatter={scatter}
          rows={filteredRows}
          onMove={onMove}
        />
      ) : (
        <>
          <PivotSlots
            columns={columns}
            pivot={pivot}
            surface="chart"
            labels={CHART_LABELS}
            onMove={onMove}
            onPivotChange={onPivotChange}
          />
          <PivotChart type={type} result={result} />
        </>
      )}
    </div>
  );
}

function PivotChart({ type, result }) {
  if (!result) {
    return (
      <p className="muted">Y軸（集計の値）に列を置くと、グラフを表示します</p>
    );
  }
  const { data, series, seriesTotal } = pivotSeries(result);
  const xName =
    result.rowFields.length > 0 ? result.rowFields.join(" / ") : "全体";
  return (
    <>
      <ChartView type={type} rows={data} x="x" xName={xName} series={series} />
      {seriesTotal > SERIES_LIMIT && (
        <p className="muted chart__note">
          {`系列が多いため、先頭 ${SERIES_LIMIT} 系列だけを描いています（全 ${seriesTotal} 系列）`}
        </p>
      )}
      {type === "pie" && series.length > 1 && (
        <p className="muted chart__note">
          {`円グラフは最初の系列（${series[0].name}）だけを描いています`}
        </p>
      )}
    </>
  );
}

function ScatterPart({ columns, scatter, rows, onMove }) {
  const numeric = columns.filter((c) => c.type === "number");
  const axis = (slot, label, name) => (
    <FieldSlot
      slot={slot}
      surface="chart"
      label={label}
      items={name ? [{ field: name, label: name }] : []}
      addOptions={numeric}
      onAdd={(field) => onMove({ field, from: null, to: { slot } })}
      onRemove={() =>
        onMove({ field: name, from: { slot, index: 0 }, to: null })
      }
    />
  );
  const x = scatter?.x ?? "";
  const y = scatter?.y ?? "";
  return (
    <>
      <div className="field-slots">
        {axis("scatterX", "X軸", x)}
        {axis("scatterY", "Y軸", y)}
      </div>
      {x && y ? (
        <ChartView type="scatter" rows={rows} x={x} y={y} />
      ) : (
        <p className="muted">X軸とY軸に数値の列を置くと、散布図を表示します</p>
      )}
    </>
  );
}
