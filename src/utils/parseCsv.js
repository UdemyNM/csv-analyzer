import Papa from "papaparse";

export class EmptyCsvError extends Error {
  constructor(message = "データがありません") {
    super(message);
    this.name = "EmptyCsvError";
  }
}

/** 1 行目の列名がすべて空欄（ヘッダーなし。FR-15）。 */
export class MissingHeaderError extends Error {
  constructor(message = "ヘッダー（1行目の列名）がありません") {
    super(message);
    this.name = "MissingHeaderError";
  }
}

// name, name, name -> name, name_2, name_3
function uniqueHeaders(rawHeaders) {
  const seen = new Set();
  const counts = new Map();
  return rawHeaders.map((raw) => {
    let name = raw;
    let n = counts.get(raw) ?? 1;
    while (seen.has(name)) {
      n += 1;
      name = `${raw}_${n}`;
    }
    counts.set(raw, n);
    seen.add(name);
    return name;
  });
}

/**
 * CSV 文字列を { headers, rows } にする（docs/03 2.2）。値は変換せず文字列のまま。
 * @param {string} text
 * @returns {{ headers: string[], rows: Record<string, string>[] }}
 */
export function parseCsv(text) {
  // 区切りはカンマ固定（自動判定だとセル内の ; やタブで列がずれる）
  const { data } = Papa.parse(text, { delimiter: ",", skipEmptyLines: true });
  if (data.length === 0) throw new EmptyCsvError();
  if (data[0].every((cell) => cell.trim() === "")) {
    throw new MissingHeaderError();
  }

  const headers = uniqueHeaders(data[0]);
  const rows = new Array(data.length - 1);
  for (let i = 1; i < data.length; i++) {
    const cells = data[i];
    const row = {};
    for (let c = 0; c < headers.length; c++) row[headers[c]] = cells[c] ?? "";
    rows[i - 1] = row;
  }
  return { headers, rows };
}
