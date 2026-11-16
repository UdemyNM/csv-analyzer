import { parseNumber } from "./parseValue.js";

const FUNCTIONS = ["sum", "avg", "count", "min", "max"];

const outputName = ({ column, fn }) =>
  fn === "count" ? "count" : `${column}_${fn}`;

/**
 * グループ化して集計する（docs/03 2.6）。元の rows は変更しない。
 * 出力順は、各グループが最初に現れた順。
 * @param {Record<string, string>[]} rows
 * @param {{ groupBy: string[], metrics: { column?: string, fn: string }[] }} spec
 */
export function aggregate(rows, { groupBy, metrics }) {
  for (const { fn } of metrics) {
    if (!FUNCTIONS.includes(fn)) throw new RangeError(`fn が不正です: ${fn}`);
  }
  if (rows.length === 0) return [];

  // 数値集計が必要な列（重複なし）。1 行につき 1 列 1 回だけ解釈する
  const numericColumns = [
    ...new Set(metrics.filter((m) => m.fn !== "count").map((m) => m.column)),
  ];
  const groups = new Map();

  for (const row of rows) {
    // 1 キーのときはその値、複数キーのときは JSON で連結（"a","bc" と "ab","c" を区別する）
    const keyValues = groupBy.map((name) => row[name] ?? "");
    const key =
      keyValues.length === 1 ? keyValues[0] : JSON.stringify(keyValues);

    let group = groups.get(key);
    if (!group) {
      group = {
        keyValues,
        count: 0,
        stats: numericColumns.map(() => ({
          sum: 0,
          n: 0,
          min: null,
          max: null,
        })),
      };
      groups.set(key, group);
    }
    group.count += 1;

    for (let i = 0; i < numericColumns.length; i++) {
      const value = parseNumber(row[numericColumns[i]]);
      if (value === null) continue;
      const stat = group.stats[i];
      stat.sum += value;
      stat.n += 1;
      if (stat.min === null || value < stat.min) stat.min = value;
      if (stat.max === null || value > stat.max) stat.max = value;
    }
  }

  const columnIndex = new Map(numericColumns.map((name, i) => [name, i]));
  return [...groups.values()].map((group) => {
    const out = {};
    groupBy.forEach((name, i) => {
      out[name] = group.keyValues[i];
    });
    for (const metric of metrics) {
      if (metric.fn === "count") {
        out[outputName(metric)] = group.count;
        continue;
      }
      const stat = group.stats[columnIndex.get(metric.column)];
      out[outputName(metric)] = {
        sum: stat.sum,
        avg: stat.n > 0 ? stat.sum / stat.n : null,
        min: stat.min,
        max: stat.max,
      }[metric.fn];
    }
    return out;
  });
}
