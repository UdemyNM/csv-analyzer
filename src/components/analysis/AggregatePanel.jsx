import { useState } from "react";
import { DataTable } from "./DataTable.jsx";
import { metricOutputName } from "./aggregationNames.js";

const FUNCTIONS = [
  ["sum", "合計 (sum)"],
  ["avg", "平均 (avg)"],
  ["count", "件数 (count)"],
  ["min", "最小 (min)"],
  ["max", "最大 (max)"],
];

/** 集計の設定は null か、groupBy も metrics も空でないもの */
const normalize = (groupBy, metrics) =>
  groupBy.length === 0 && metrics.length === 0 ? null : { groupBy, metrics };

/**
 * 集計セクションの中身: グループ化・指標の選択と、集計結果の表。
 * 集計の計算は親が行い、結果を resultRows で受け取る（グラフも同じ結果を使うため）。
 */
export function AggregatePanel({
  columns,
  aggregation,
  resultRows,
  onAggregationChange,
}) {
  const [metricColumn, setMetricColumn] = useState("");
  const [metricFn, setMetricFn] = useState("sum");

  const groupBy = aggregation?.groupBy ?? [];
  const metrics = aggregation?.metrics ?? [];
  const numericColumns = columns.filter((c) => c.type === "number");
  const selectedColumn = numericColumns.some((c) => c.name === metricColumn)
    ? metricColumn
    : (numericColumns[0]?.name ?? "");
  const needsColumn = metricFn !== "count";

  const toggleGroupBy = (name) => {
    const next = groupBy.includes(name)
      ? groupBy.filter((g) => g !== name)
      : [...groupBy, name];
    onAggregationChange(normalize(next, metrics));
  };

  const addMetric = () => {
    const metric = needsColumn
      ? { column: selectedColumn, fn: metricFn }
      : { fn: "count" };
    // 同じ指標（同じ出力名）を二重に足さない
    if (metrics.some((m) => metricOutputName(m) === metricOutputName(metric))) {
      return;
    }
    onAggregationChange({ groupBy, metrics: [...metrics, metric] });
  };

  const removeMetric = (index) => {
    onAggregationChange(
      normalize(
        groupBy,
        metrics.filter((_, i) => i !== index),
      ),
    );
  };

  const typeOf = (name) => columns.find((c) => c.name === name)?.type ?? "string";
  const resultColumns = aggregation
    ? [
        ...groupBy.map((name) => ({ name, type: typeOf(name) })),
        ...metrics.map((m) => ({ name: metricOutputName(m), type: "number" })),
      ]
    : [];

  return (
    <div className="aggregate">
      <div className="aggregate__controls">
        <fieldset className="fieldset">
          <legend>グループ化</legend>
          <div className="check-list">
            {columns.map((c) => (
              <label key={c.name} className="check">
                <input
                  type="checkbox"
                  checked={groupBy.includes(c.name)}
                  onChange={() => toggleGroupBy(c.name)}
                />
                <span>{c.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="aggregate__metrics">
          <p className="field-title">指標</p>
          <div className="control-row">
            <select
              className="input"
              aria-label="指標の列"
              value={selectedColumn}
              disabled={!needsColumn}
              onChange={(e) => setMetricColumn(e.target.value)}
            >
              {numericColumns.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="input"
              aria-label="集計関数"
              value={metricFn}
              onChange={(e) => setMetricFn(e.target.value)}
            >
              {FUNCTIONS.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              disabled={needsColumn && selectedColumn === ""}
              onClick={addMetric}
            >
              指標を追加
            </button>
          </div>
          {metrics.length > 0 && (
            <ul className="chips" aria-label="指標">
              {metrics.map((m, i) => (
                <li key={metricOutputName(m)} className="chip">
                  <span>{metricOutputName(m)}</span>
                  <button
                    type="button"
                    className="chip__remove"
                    aria-label={`${metricOutputName(m)}を削除`}
                    onClick={() => removeMetric(i)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {aggregation && (
        <DataTable columns={resultColumns} rows={resultRows} label="集計結果" />
      )}
    </div>
  );
}
