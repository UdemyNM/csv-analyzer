/**
 * 列見出しメニューの「値から選ぶ」で使う純粋関数（設計書 6.1）。
 * 空欄は "" で持ち、画面では EMPTY_LABEL と出す。
 */

export const EMPTY_LABEL = "（空欄）";
/** 候補として一度に出す値の種類の上限 */
export const VALUE_LIMIT = 1000;

const compareText = (a, b) => a.localeCompare(b, "ja");

/**
 * 列の値ごとの件数。件数の多い順、同数は値の昇順。
 * @returns {{ value: string, count: number }[]}
 */
export function countValues(rows, column) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[column] ?? "";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || compareText(a.value, b.value));
}

/**
 * チェックした値から条件を作る。選んだ値と外した値の少ないほうで持つ（同数は in）。
 * 全部選んだら null（条件なし）。0 個は RangeError。
 * @param {string} column
 * @param {Set<string>} selected
 * @param {string[]} allValues 候補の全種類
 */
export function selectionToFilter(column, selected, allValues) {
  const chosen = allValues.filter((v) => selected.has(v));
  if (chosen.length === 0) throw new RangeError("値が 1 つも選ばれていません");
  if (chosen.length === allValues.length) return null;
  const excluded = allValues.filter((v) => !selected.has(v));
  return chosen.length <= excluded.length
    ? { column, op: "in", values: chosen }
    : { column, op: "notIn", values: excluded };
}

/** 条件から、チェックの付いた値の集合に戻す。条件なしなら全部 */
export function filterToSelection(filter, allValues) {
  if (!filter) return new Set(allValues);
  const set = new Set(filter.values);
  return filter.op === "in"
    ? new Set(allValues.filter((v) => set.has(v)))
    : new Set(allValues.filter((v) => !set.has(v)));
}

/** その列の「値から選ぶ」条件（in / notIn）を位置つきで探す */
export function findValueFilter(filters, column) {
  const index = filters.findIndex(
    (f) => f.column === column && (f.op === "in" || f.op === "notIn"),
  );
  return index === -1 ? null : { index, filter: filters[index] };
}
