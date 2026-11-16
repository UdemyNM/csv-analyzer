import { inferColumnType } from "./inferColumnTypes.js";
import { parseNumber, normalizeDate } from "./parseValue.js";

export class InvalidFilterError extends Error {
  constructor(message) {
    super(message);
    this.name = "InvalidFilterError";
  }
}

const COMPARISONS = {
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
};

// 条件 1 つを「行 → boolean」の関数にする。不正な条件はここで InvalidFilterError
function buildPredicate(rows, { column, op, value }) {
  if (!Object.hasOwn(rows[0], column)) {
    throw new InvalidFilterError(`列「${column}」が存在しません`);
  }
  switch (op) {
    case "eq":
      return (row) => row[column] === value;
    case "ne":
      return (row) => row[column] !== value;
    case "contains":
      return (row) => row[column].includes(value);
  }

  const compare = COMPARISONS[op];
  if (!compare) throw new InvalidFilterError(`未対応の条件です: ${op}`);

  // 列の型は、渡された rows から推定する
  const type = inferColumnType(rows, column);
  if (type === "string") {
    throw new InvalidFilterError(
      `列「${column}」は数値・日付ではないため「${op}」は使えません`,
    );
  }
  const parse = type === "number" ? parseNumber : normalizeDate;
  const target = parse(value);
  if (target === null) {
    throw new InvalidFilterError(
      `「${value}」は${type === "number" ? "数値" : "日付"}として解釈できません`,
    );
  }
  // 空欄は parse が null になるので、どの比較にも一致しない
  return (row) => {
    const cell = parse(row[column]);
    return cell !== null && compare(cell, target);
  };
}

/**
 * 条件（AND）で行を絞り込む（docs/03 2.4）。元の配列は変更しない。
 * @param {Record<string, string>[]} rows
 * @param {{ column: string, op: string, value: string }[]} filters
 */
export function filterRows(rows, filters) {
  if (rows.length === 0) return [];
  const predicates = filters.map((filter) => buildPredicate(rows, filter));
  return rows.filter((row) => predicates.every((test) => test(row)));
}
