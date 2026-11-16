/**
 * ビュー設定（views.config = { filters, sort, aggregation, chart }）の検証と整形（docs/03 5 章）。
 * chart の軸は集計の出力名も取りうるため、ここでは検証しない（親が「今の元データにある列」に絞ってから渡す）。
 */

export const EMPTY_CONFIG = Object.freeze({
  filters: [],
  sort: null,
  aggregation: null,
  chart: null,
});

/**
 * config が参照する列のうち、columnNames にないものを返す（重複なし）。
 * 対象: filters[].column / sort.column / aggregation.groupBy[] / aggregation.metrics[].column（count は省略可）
 * @returns {string[]}
 */
export function findMissingColumns(config, columnNames) {
  const known = new Set(columnNames);
  const referenced = [
    ...(config.filters ?? []).map((f) => f.column),
    ...(config.sort ? [config.sort.column] : []),
    ...(config.aggregation?.groupBy ?? []),
    ...(config.aggregation?.metrics ?? [])
      .filter((m) => m.fn !== "count" || m.column !== undefined)
      .map((m) => m.column),
  ];
  return [...new Set(referenced.filter((name) => !known.has(name)))];
}

/**
 * 読み込んだビューの config から、データセットにない列を参照する設定だけを無効にする。
 * @returns {{config: object, disabled: string[]}}  disabled は無効にした設定の説明（画面の警告に使う）
 */
export function sanitizeConfig(config, columnNames) {
  const known = new Set(columnNames);
  const disabled = [];

  const filters = (config.filters ?? []).filter((f) => {
    if (known.has(f.column)) return true;
    disabled.push(`絞り込み条件（${f.column}）`);
    return false;
  });

  let sort = config.sort ?? null;
  if (sort && !known.has(sort.column)) {
    disabled.push(`並べ替え（${sort.column}）`);
    sort = null;
  }

  let aggregation = null;
  if (config.aggregation) {
    const groupBy = config.aggregation.groupBy.filter((name) => {
      if (known.has(name)) return true;
      disabled.push(`グループ化（${name}）`);
      return false;
    });
    const metrics = config.aggregation.metrics.filter((m) => {
      if (m.fn === "count" || known.has(m.column)) return true;
      disabled.push(`指標（${m.column}）`);
      return false;
    });
    if (groupBy.length > 0 || metrics.length > 0) {
      aggregation = { groupBy, metrics };
    }
  }

  return {
    config: { filters, sort, aggregation, chart: config.chart ?? null },
    disabled,
  };
}
