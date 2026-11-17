/**
 * ビュー設定（views.config）の形・古い形からの変換・検証（設計書 9 章）。
 *
 * 新しい形: { filters, sort, hiddenRows, hiddenColumns, pivot, chart }
 *   pivot: { rows: string[], columns: string[], values: { column?, fn }[] } | null
 *   chart: { type: "bar"|"line"|"pie"|"scatter", scatter: { x, y } | null } | null
 * 古い形: { filters, sort, aggregation: { groupBy, metrics } | null, chart: { type, x, y } | null }
 */
import { FN_LABELS } from "../../utils/pivot.js";

export const EMPTY_CONFIG = Object.freeze({
  filters: [],
  sort: null,
  hiddenRows: [],
  hiddenColumns: [],
  pivot: null,
  chart: null,
});

/** 古い chart（{ type, x, y }）か */
const isOldChart = (chart) => chart != null && !Object.hasOwn(chart, "scatter");

/**
 * 古い形を新しい形にする。新しい形はそのまま返す（足りない項目は空で補う）。
 * 集計なしの棒・折れ線・円は、集計（行＝X、値＝Y の合計）に変換し、notes で知らせる。
 * @returns {{ config: object, notes: string[] }}
 */
export function migrateConfig(raw) {
  const notes = [];
  let pivot = raw.pivot ?? null;
  if (raw.aggregation) {
    pivot = {
      rows: raw.aggregation.groupBy,
      columns: [],
      values: raw.aggregation.metrics,
    };
  }

  let chart = raw.chart ?? null;
  if (isOldChart(chart)) {
    const { type, x, y } = chart;
    if (type === "scatter") {
      chart = { type, scatter: x || y ? { x: x ?? "", y: y ?? "" } : null };
    } else {
      chart = { type, scatter: null };
      if (!raw.aggregation && !pivot && x && y) {
        pivot = { rows: [x], columns: [], values: [{ column: y, fn: "sum" }] };
        notes.push(
          `グラフの設定を集計（行＝${x}、値＝${y}の合計）に変換しました`,
        );
      }
    }
  }

  return {
    config: {
      filters: raw.filters ?? [],
      sort: raw.sort ?? null,
      hiddenRows: raw.hiddenRows ?? [],
      hiddenColumns: raw.hiddenColumns ?? [],
      pivot,
      chart,
    },
    notes,
  };
}

export const BROKEN_NOTE =
  "ビューの設定に読み込めない部分があったため、その部分を無効にしました";

// filterRows が受け付ける条件
const COMPARE_OPS = ["eq", "ne", "contains", "gt", "gte", "lt", "lte"];
const SET_OPS = ["in", "notIn"];
const CHART_TYPES = ["bar", "line", "pie", "scatter"];

const isObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const isString = (v) => typeof v === "string";

const isValidFilter = (f) =>
  isObject(f) &&
  isString(f.column) &&
  (SET_OPS.includes(f.op)
    ? Array.isArray(f.values) && f.values.every(isString)
    : COMPARE_OPS.includes(f.op) && isString(f.value));

const isValidSort = (s) =>
  isObject(s) &&
  isString(s.column) &&
  (s.direction === "asc" || s.direction === "desc");

// count 以外は集計する列が必要
const isValidMetric = (m) =>
  isObject(m) &&
  Object.hasOwn(FN_LABELS, m.fn) &&
  (m.column === undefined ? m.fn === "count" : isString(m.column));

const isOptionalString = (v) => v === undefined || isString(v);

/**
 * 保存された config の「形」を確かめる（共有されたビューは他人が保存した値。壊れていても画面を落とさない）。
 * 形の正しくない部分だけを捨て（配列は要素ごと）、捨てたら broken: true。列名の有無は見ない（sanitizeConfig が見る）。
 * 項目が無い（undefined）ことは壊れているとみなさない（古い形・足りない項目は migrateConfig が補う）。
 * @returns {{ config: object, broken: boolean }}
 */
function normalizeShape(raw) {
  if (!isObject(raw)) return { config: {}, broken: true };
  let broken = false;
  const fail = (fallback) => {
    broken = true;
    return fallback;
  };
  // 配列なら test を満たす要素だけ残す。配列でなければ []
  const list = (value, test) => {
    if (!Array.isArray(value)) return fail([]);
    const kept = value.filter(test);
    if (kept.length !== value.length) broken = true;
    return kept;
  };
  // 項目が無い・null はそのまま。あれば check で確かめる
  const field = (value, check) => (value == null ? value : check(value));

  const config = {
    filters: field(raw.filters, (v) => list(v, isValidFilter)),
    sort: field(raw.sort, (v) => (isValidSort(v) ? v : fail(null))),
    hiddenRows: field(raw.hiddenRows, (v) => (Array.isArray(v) ? v : fail([]))),
    hiddenColumns: field(raw.hiddenColumns, (v) => list(v, isString)),
    pivot: field(raw.pivot, (v) =>
      isObject(v)
        ? {
            rows: list(v.rows, isString),
            columns: list(v.columns, isString),
            values: list(v.values, isValidMetric),
          }
        : fail(null),
    ),
    aggregation: field(raw.aggregation, (v) =>
      isObject(v)
        ? {
            groupBy: list(v.groupBy, isString),
            metrics: list(v.metrics, isValidMetric),
          }
        : fail(null),
    ),
    chart: field(raw.chart, (v) => {
      if (!isObject(v) || !CHART_TYPES.includes(v.type)) return fail(null);
      if (Object.hasOwn(v, "scatter")) {
        const { scatter } = v;
        const ok =
          scatter === null ||
          (isObject(scatter) && isString(scatter.x) && isString(scatter.y));
        return { type: v.type, scatter: ok ? scatter : fail(null) };
      }
      // 古い形 { type, x, y }
      return {
        type: v.type,
        x: isOptionalString(v.x) ? v.x : fail(undefined),
        y: isOptionalString(v.y) ? v.y : fail(undefined),
      };
    }),
  };
  return { config, broken };
}

const valueColumns = (pivot) =>
  (pivot?.values ?? [])
    .filter((v) => v.column !== undefined)
    .map((v) => v.column);

/**
 * config が参照する列のうち、columnNames にないものを返す（重複なし）。
 * 対象: filters / sort / hiddenColumns / pivot の 3 枠 / chart.scatter
 * @returns {string[]}
 */
export function findMissingColumns(config, columnNames) {
  const known = new Set(columnNames);
  const scatter = config.chart?.scatter;
  const referenced = [
    ...(config.filters ?? []).map((f) => f.column),
    ...(config.sort ? [config.sort.column] : []),
    ...(config.hiddenColumns ?? []),
    ...(config.pivot?.rows ?? []),
    ...(config.pivot?.columns ?? []),
    ...valueColumns(config.pivot),
    ...(scatter ? [scatter.x, scatter.y].filter((name) => name) : []),
  ];
  return [...new Set(referenced.filter((name) => !known.has(name)))];
}

/**
 * 読み込んだビューの config を新しい形にし、データセットにない列を参照する設定だけを無効にする。
 * hiddenRows のうち行数以上の番号は、黙って捨てる。
 * @returns {{ config: object, disabled: string[], notes: string[] }}
 *   disabled は無効にした設定の説明、notes は形の変換の知らせ（どちらも画面の警告に使う）
 */
export function sanitizeConfig(raw, columnNames, rowCount) {
  const { config: shaped, broken } = normalizeShape(raw);
  const { config: migrated, notes } = migrateConfig(shaped);
  if (broken) notes.unshift(BROKEN_NOTE);
  const known = new Set(columnNames);
  const disabled = [];
  const keep = (label) => (name) => {
    if (known.has(name)) return true;
    disabled.push(`${label}（${name}）`);
    return false;
  };

  const filters = migrated.filters.filter((f) =>
    keep("絞り込み条件")(f.column),
  );

  let sort = migrated.sort;
  if (sort && !keep("並べ替え")(sort.column)) sort = null;

  const hiddenColumns = migrated.hiddenColumns.filter(keep("非表示の列"));
  const hiddenRows = migrated.hiddenRows.filter(
    (i) => Number.isInteger(i) && i >= 0 && i < rowCount,
  );

  let pivot = null;
  if (migrated.pivot) {
    const rows = migrated.pivot.rows.filter(keep("集計の行"));
    const columns = migrated.pivot.columns.filter(keep("集計の列"));
    const values = migrated.pivot.values.filter(
      (v) => v.column === undefined || keep("集計の値")(v.column),
    );
    if (rows.length > 0 || columns.length > 0 || values.length > 0) {
      pivot = { rows, columns, values };
    }
  }

  let chart = migrated.chart;
  if (chart?.scatter) {
    const axis = (name) =>
      name === "" || keep("散布図の軸")(name) ? name : "";
    chart = {
      ...chart,
      scatter: { x: axis(chart.scatter.x), y: axis(chart.scatter.y) },
    };
  }

  return {
    config: { filters, sort, hiddenRows, hiddenColumns, pivot, chart },
    disabled,
    notes,
  };
}
