/** 表のセルに出す文字。文字列はそのまま、数値は桁区切りと小数 4 桁まで、null は「-」。 */
export function formatCell(value) {
  if (value === null) return "-";
  if (value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "-";
    return value.toLocaleString("ja-JP", { maximumFractionDigits: 4 });
  }
  return String(value);
}
