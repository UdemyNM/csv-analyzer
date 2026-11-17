/**
 * ビュー設定（views.config）の形・古い形からの変換・検証（設計書 9 章）。
 *
 * 新しい形: { filters, sort, hiddenRows, hiddenColumns, pivot, chart }
 *   pivot: { rows: string[], columns: string[], values: { column?, fn }[] } | null
 *   chart: { type: "bar"|"line"|"pie"|"scatter", scatter: { x, y } | null } | null
 * 古い形: { filters, sort, aggregation: { groupBy, metrics } | null, chart: { type, x, y } | null }
 */

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
  const { config: migrated, notes } = migrateConfig(raw);
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
