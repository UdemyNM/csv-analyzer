import { parseNumber } from "./parseValue.js";

// 2 列のペアワイズ相関。有効ペアが 2 件未満、またはどちらかが全部同じ値なら null
function pearson(xs, ys) {
  const length = Math.min(xs.length, ys.length);
  let n = 0;
  let sumX = 0;
  let sumY = 0;
  let firstX = 0;
  let firstY = 0;
  let sameX = true;
  let sameY = true;
  for (let i = 0; i < length; i++) {
    const x = xs[i];
    const y = ys[i];
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    if (n === 0) {
      firstX = x;
      firstY = y;
    } else {
      if (x !== firstX) sameX = false;
      if (y !== firstY) sameY = false;
    }
    n += 1;
    sumX += x;
    sumY += y;
  }
  // 分散 0 は丸め誤差を避けるため「値がすべて同じ」で判定する
  if (n < 2 || sameX || sameY) return null;

  const meanX = sumX / n;
  const meanY = sumY / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < length; i++) {
    const x = xs[i];
    const y = ys[i];
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    sxy += (x - meanX) * (y - meanY);
    sxx += (x - meanX) ** 2;
    syy += (y - meanY) ** 2;
  }
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

/**
 * ピアソン相関行列（docs/03 2.8）。入力は列ごとの文字列配列、出力は対称行列。
 * @param {string[][]} columnsValues
 * @returns {(number | null)[][]}
 */
export function correlation(columnsValues) {
  // 数値でない値は NaN（= 空欄と同じ扱い）にして 1 度だけ解釈する
  const columns = columnsValues.map((values) =>
    Float64Array.from(values, (text) => parseNumber(text) ?? NaN),
  );
  const size = columns.length;
  const matrix = Array.from({ length: size }, () => new Array(size).fill(1));
  for (let i = 0; i < size; i++) {
    for (let j = i + 1; j < size; j++) {
      matrix[i][j] = matrix[j][i] = pearson(columns[i], columns[j]);
    }
  }
  return matrix;
}
