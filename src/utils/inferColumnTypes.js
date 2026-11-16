import { parseNumber, normalizeDate } from "./parseValue.js";

/**
 * 1 列の型を推定する。空欄を除いた値がすべて数値なら number、すべて日付なら date、
 * それ以外は string。全て空欄・データなしは string。
 * @param {Record<string, string>[]} rows
 * @param {string} name
 * @returns {'number' | 'date' | 'string'}
 */
export function inferColumnType(rows, name) {
  let isNumber = true;
  let isDate = true;
  let hasValue = false;
  for (const row of rows) {
    const cell = row[name];
    if (cell === undefined || cell === "") continue;
    hasValue = true;
    if (isNumber && parseNumber(cell) === null) isNumber = false;
    if (isDate && normalizeDate(cell) === null) isDate = false;
    if (!isNumber && !isDate) return "string";
  }
  if (!hasValue) return "string";
  return isNumber ? "number" : "date";
}

/**
 * @param {string[]} headers
 * @param {Record<string, string>[]} rows
 * @returns {{ name: string, type: 'number' | 'date' | 'string' }[]}
 */
export function inferColumnTypes(headers, rows) {
  return headers.map((name) => ({ name, type: inferColumnType(rows, name) }));
}
