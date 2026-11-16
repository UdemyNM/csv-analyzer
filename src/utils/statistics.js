import { parseNumber } from "./parseValue.js";

/**
 * 基本統計（docs/03 2.7）。標準偏差は標本標準偏差（n-1 で割る）。
 * 空欄・数値でない値は missing に数え、計算から除外する。
 * @param {string[]} values
 */
export function statistics(values) {
  const numbers = [];
  for (const text of values) {
    const n = parseNumber(text);
    if (n !== null) numbers.push(n);
  }
  const count = numbers.length;
  const missing = values.length - count;
  if (count === 0) {
    return {
      count,
      missing,
      mean: null,
      median: null,
      stdDev: null,
      min: null,
      max: null,
    };
  }

  const sorted = Float64Array.from(numbers).sort(); // 型付き配列は数値順
  const mean = numbers.reduce((sum, n) => sum + n, 0) / count;
  const mid = count >> 1;
  const median =
    count % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const stdDev =
    count < 2
      ? null
      : Math.sqrt(
          numbers.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (count - 1),
        );

  return {
    count,
    missing,
    mean,
    median,
    stdDev,
    min: sorted[0],
    max: sorted[count - 1],
  };
}
