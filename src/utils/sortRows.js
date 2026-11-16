import { parseNumber, normalizeDate } from "./parseValue.js";

// 日本語ロケール比較は重いので、Collator は 1 度だけ作って使い回す
const collator = new Intl.Collator("ja");

const KEY_OF = {
  number: parseNumber,
  date: normalizeDate, // YYYY-MM-DD は文字列比較で日付順になる
  string: (text) => (typeof text === "string" && text !== "" ? text : null),
};

/**
 * 列で並べ替える（docs/03 2.5）。空欄・解釈できない値は昇順・降順とも最後尾。
 * 安定ソート。元の配列は変更しない。
 * @param {Record<string, string>[]} rows
 * @param {{ column: string, direction: 'asc' | 'desc' }} sort
 * @param {'number' | 'date' | 'string'} columnType
 */
export function sortRows(rows, { column, direction }, columnType) {
  if (direction !== "asc" && direction !== "desc") {
    throw new RangeError(`direction が不正です: ${direction}`);
  }
  if (!Object.hasOwn(KEY_OF, columnType)) {
    throw new RangeError(`columnType が不正です: ${columnType}`);
  }

  const toKey = KEY_OF[columnType];
  const compareKeys =
    columnType === "string"
      ? collator.compare
      : (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const sign = direction === "asc" ? 1 : -1;

  const items = rows.map((row, index) => ({
    row,
    index,
    key: toKey(row[column]),
  }));
  items.sort((a, b) => {
    if (a.key === null || b.key === null) {
      if (a.key === b.key) return a.index - b.index;
      return a.key === null ? 1 : -1; // 空欄は方向に関わらず最後
    }
    return sign * compareKeys(a.key, b.key) || a.index - b.index;
  });
  return items.map((item) => item.row);
}
