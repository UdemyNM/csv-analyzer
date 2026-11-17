import { normalizeDate, parseNumber } from "./parseValue.js";
import { EMPTY_LABEL } from "./valueSelection.js";

/**
 * ピボット（行・列・値）の計算と、表・グラフ向けの変換（設計書 7.2 / 8.2）。
 * 集計関数の意味は旧 aggregate と同じ: count は行数。sum / avg / min / max は数値として読めた値だけ
 * （読めた値が 0 個なら sum は 0、avg / min / max は null）。
 */

export const FN_LABELS = {
  sum: "合計",
  avg: "平均",
  count: "件数",
  min: "最小",
  max: "最大",
};
const FUNCTIONS = Object.keys(FN_LABELS);

/** 表示するクロス集計の列キーの上限 */
export const COLUMN_KEY_LIMIT = 50;
/** グラフに描く系列の上限（ChartView の色の数） */
export const SERIES_LIMIT = 8;

/** 値の表示名。「売上・合計」。column なしの count は「件数」 */
export const valueLabel = ({ column, fn }) =>
  column === undefined ? FN_LABELS[fn] : `${column}・${FN_LABELS[fn]}`;

/** キー（値の配列）の表示名。" / " でつなぎ、空欄は「（空欄）」 */
export const keyLabel = (key) =>
  key.map((v) => (v === "" ? EMPTY_LABEL : v)).join(" / ");

const compareText = (a, b) => a.localeCompare(b, "ja");

/** 列の型に合わせた値の比較。読めない値・空欄は最後 */
function compareValue(type, a, b) {
  if (a === b) return 0;
  if (a === "") return 1;
  if (b === "") return -1;
  const parse =
    type === "number" ? parseNumber : type === "date" ? normalizeDate : null;
  if (parse) {
    const pa = parse(a);
    const pb = parse(b);
    if (pa !== null && pb !== null) {
      if (pa < pb) return -1;
      if (pa > pb) return 1;
      return compareText(a, b);
    }
    if (pa !== null) return -1;
    if (pb !== null) return 1;
  }
  return compareText(a, b);
}

/**
 * キーの id（Map のキー）。1 列ならその値そのもの。2 列以上は「長さ:値」をつなぐ
 * （区切り文字に頼らないので "a / b" と "a","b" や、記号を含む値でも取り違えない。
 * 列の数は 1 回のピボットの中で一定なので、1 列の値と 2 列以上の id は混ざらない）。
 * 25 万行で毎行 JSON.stringify や配列を作ると重いので、行から直接作る。
 */
const joinId = (values) => {
  let id = "";
  for (const v of values) id += `${v.length}:${v}`;
  return id;
};
const keyIdOf = (fields) => {
  if (fields.length === 1) return (row) => row[fields[0]] ?? "";
  return (row) => {
    let id = "";
    for (const name of fields) {
      const v = row[name] ?? "";
      id += `${v.length}:${v}`;
    }
    return id;
  };
};
const idOfKey = (key) => (key.length === 1 ? key[0] : joinId(key));
const keyOf = (fields, row) => fields.map((name) => row[name] ?? "");

const newStats = (n) => ({
  count: 0,
  nums: Array.from({ length: n }, () => ({
    sum: 0,
    n: 0,
    min: null,
    max: null,
  })),
});

function valueOf(stats, metric, numIndex) {
  if (!stats) return null;
  if (metric.fn === "count") return stats.count;
  const s = stats.nums[numIndex.get(metric.column)];
  switch (metric.fn) {
    case "sum":
      return s.sum;
    case "avg":
      return s.n > 0 ? s.sum / s.n : null;
    case "min":
      return s.min;
    default:
      return s.max;
  }
}

/**
 * @param {Record<string, string>[]} rows
 * @param {{ rows: string[], columns: string[], values: { column?: string, fn: string }[] } | null} spec
 * @param {(column: string) => "number" | "date" | "string"} typeOf
 * @returns {null | {
 *   rowFields: string[], columnFields: string[], values: object[],
 *   columnKeys: string[][], columnKeyTotal: number,
 *   records: { rowKey: string[], cells: (number|null)[] }[],
 * }}  cells[c * values.length + v] = 列キー c・値 v の集計。値が空なら null
 */
export function pivot(rows, spec, typeOf) {
  if (!spec || spec.values.length === 0) return null;
  const { rows: rowFields, columns: columnFields, values } = spec;
  for (const { fn } of values) {
    if (!FUNCTIONS.includes(fn)) throw new RangeError(`fn が不正です: ${fn}`);
  }

  // 数値として集計する列（重複なし）。1 行につき 1 列 1 回だけ解釈する
  const numericColumns = [
    ...new Set(values.filter((v) => v.fn !== "count").map((v) => v.column)),
  ];
  const numIndex = new Map(numericColumns.map((name, i) => [name, i]));

  const rowIdOf = keyIdOf(rowFields);
  const colIdOf = keyIdOf(columnFields);
  const groups = new Map(); // 行キーの id -> { rowKey, cols: Map<列キーの id, stats> }
  const columnKeyMap = new Map(); // 列キーの id -> 列キー
  for (const row of rows) {
    const rowId = rowIdOf(row);
    const colId = colIdOf(row);

    let group = groups.get(rowId);
    if (!group) {
      group = { rowKey: keyOf(rowFields, row), cols: new Map() };
      groups.set(rowId, group);
    }
    if (!columnKeyMap.has(colId)) {
      columnKeyMap.set(colId, keyOf(columnFields, row));
    }
    let stats = group.cols.get(colId);
    if (!stats) {
      stats = newStats(numericColumns.length);
      group.cols.set(colId, stats);
    }
    stats.count += 1;
    for (let i = 0; i < numericColumns.length; i++) {
      const value = parseNumber(row[numericColumns[i]]);
      if (value === null) continue;
      const s = stats.nums[i];
      s.sum += value;
      s.n += 1;
      if (s.min === null || value < s.min) s.min = value;
      if (s.max === null || value > s.max) s.max = value;
    }
  }

  const types = columnFields.map((name) => typeOf(name));
  const sortedKeys = [...columnKeyMap.values()].sort((a, b) => {
    for (let i = 0; i < a.length; i++) {
      const c = compareValue(types[i], a[i], b[i]);
      if (c !== 0) return c;
    }
    return 0;
  });
  // 行が 0 件でも、列の枠が空なら列キーは [[]]（値の列だけの 1 段の表）
  const allKeys =
    columnFields.length === 0 && sortedKeys.length === 0 ? [[]] : sortedKeys;
  const columnKeys = allKeys.slice(0, COLUMN_KEY_LIMIT);
  const colIds = columnKeys.map(idOfKey);

  const records = [...groups.values()].map((group) => ({
    rowKey: group.rowKey,
    cells: colIds.flatMap((colId) =>
      values.map((metric) => valueOf(group.cols.get(colId), metric, numIndex)),
    ),
  }));

  return {
    rowFields,
    columnFields,
    values,
    columnKeys,
    columnKeyTotal: allKeys.length,
    records,
  };
}

/**
 * ピボットの結果を、グラフ（棒・折れ線・円）のデータにする。
 * 系列 = 列キー × 値。maxSeries を超えた分は描かない（seriesTotal は全数）。
 * @returns {{ data: object[], series: { key: string, name: string }[], seriesTotal: number }}
 */
export function pivotSeries(result, maxSeries = SERIES_LIMIT) {
  const { columnFields, values, columnKeys, records } = result;
  const all = [];
  columnKeys.forEach((key, c) => {
    values.forEach((metric, v) => {
      let name;
      if (columnFields.length === 0) name = valueLabel(metric);
      else if (values.length === 1) name = keyLabel(key);
      else name = `${keyLabel(key)} / ${valueLabel(metric)}`;
      all.push({ index: c * values.length + v, name });
    });
  });
  const picked = all.slice(0, maxSeries);
  const series = picked.map((s, i) => ({ key: `s${i}`, name: s.name }));
  const data = records.map((record) => {
    const point = {
      x: record.rowKey.length > 0 ? keyLabel(record.rowKey) : "全体",
    };
    picked.forEach((s, i) => {
      point[`s${i}`] = record.cells[s.index];
    });
    return point;
  });
  return { data, series, seriesTotal: all.length };
}
