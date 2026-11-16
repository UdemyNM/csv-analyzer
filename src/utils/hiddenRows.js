/**
 * 行の非表示（設計書 6.2）。行は「元の行番号」（CSV のデータ行の 0 始まりの添字）で覚える。
 * 非表示の行は、データ表・グラフ・集計・統計のすべてから除く（絞り込みより前に除く）。
 */

/** 元の行番号 hiddenRows の行を除く。空なら rows をそのまま（同じ参照）返す */
export function excludeHiddenRows(rows, hiddenRows) {
  if (hiddenRows.length === 0) return rows;
  const hidden = new Set(hiddenRows);
  return rows.filter((_, i) => !hidden.has(i));
}

/** 行オブジェクト → 元の行番号 の索引（絞り込み・並べ替え後の行から元の番号を引く） */
export function buildRowIndex(rows) {
  const index = new WeakMap();
  rows.forEach((row, i) => index.set(row, i));
  return index;
}
