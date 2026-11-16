/** 集計の出力列名。aggregate() と同じ規則（<column>_<fn>、count は count）。 */
export const metricOutputName = ({ column, fn }) =>
  fn === "count" ? "count" : `${column}_${fn}`;
