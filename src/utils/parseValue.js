// 数値・日付の解釈を集約する（docs/03 2.4 末尾）。
// inferColumnTypes / filterRows / sortRows / aggregate / statistics / correlation が共通で使う。

// 整数部は「桁区切りカンマ付き（1,234）」か「カンマなし」。符号は - のみ
const NUMBER_RE = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
// YYYY-MM-DD または YYYY/MM/DD（区切りは 1 つの値の中で統一）
const DATE_RE = /^(\d{4})([-/])(\d{2})\2(\d{2})$/;

/** 数値として解釈できれば number、できない・空欄なら null */
export function parseNumber(text) {
  if (typeof text !== "string" || !NUMBER_RE.test(text)) return null;
  return Number(text.replaceAll(",", ""));
}

/** 日付として解釈できれば 'YYYY-MM-DD'、できない・空欄・存在しない日付なら null */
export function normalizeDate(text) {
  if (typeof text !== "string") return null;
  const match = DATE_RE.exec(text);
  if (!match) return null;
  const [, year, , month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const valid =
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day);
  return valid ? `${year}-${month}-${day}` : null;
}
