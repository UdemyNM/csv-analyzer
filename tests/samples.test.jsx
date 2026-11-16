// 対象: samples/ の 3 つの CSV（実ファイルのバイト列）を、分析の部品に通して確かめる
// 仕様: samples/README.md「確かめ方の例」、docs/03 2 章（各ユーティリティ）、docs/03 2.3・2.6（型推定・合計行の扱い）
//   流れ: fs で読む → ArrayBuffer → detectEncoding → TextDecoder → parseCsv → inferColumnTypes → 各分析
//   画面に列名は固定しない（アプリは列名を知らない）。このテストは「サンプルの中身」を知っているので列名を使う。
// 期待値は、実装を使わない参照計算（tests/sampleHelpers.js）か、README の数字から取る。
import { describe, it, expect } from "vitest";
import { detectEncoding } from "../src/utils/detectEncoding.js";
import { parseCsv } from "../src/utils/parseCsv.js";
import { inferColumnTypes } from "../src/utils/inferColumnTypes.js";
import { filterRows, InvalidFilterError } from "../src/utils/filterRows.js";
import { sortRows } from "../src/utils/sortRows.js";
import { aggregate } from "../src/utils/aggregate.js";
import { statistics } from "../src/utils/statistics.js";
import { correlation } from "../src/utils/correlation.js";
import { handleParseRequest } from "../src/workers/csvParse.worker.js";
import {
  SALES_PRODUCTS,
  SALES_STORES,
  SAMPLE_NAMES,
  SJIS_GRAND_TOTAL,
  SJIS_TOTAL_BY_STORE_PRODUCT,
  SURVEY_COMMENTS,
  num,
  pearson,
  readSampleBuffer,
  readSampleBytes,
  sampleStdDev,
} from "./sampleHelpers.js";

/** アプリと同じ順（detectEncoding → デコード → parseCsv → inferColumnTypes）で読む */
function load(name) {
  const buffer = readSampleBuffer(name);
  const encoding = detectEncoding(buffer);
  const text = new TextDecoder(encoding).decode(buffer);
  const { headers, rows } = parseCsv(text);
  const columns = inferColumnTypes(headers, rows);
  return { buffer, encoding, headers, rows, columns };
}

const typesOf = (columns) =>
  Object.fromEntries(columns.map((c) => [c.name, c.type]));
const keyOf = (row) => `${row["店舗"]}|${row["商品"]}`;
const sumOf = (values) => values.reduce((a, b) => a + b, 0);

describe("sales_2024q1.csv（UTF-8・LF・素直な形）", () => {
  const sales = load("sales_2024q1.csv");

  it("ファイルの形: BOM なし・LF（CR を含まない）", () => {
    const bytes = readSampleBytes("sales_2024q1.csv");
    expect([...bytes.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.includes(0x0d)).toBe(false);
  });

  it("文字コードは utf-8", () => {
    expect(sales.encoding).toBe("utf-8");
  });

  it("1,092 行・6 列。全行が同じ 6 つの列を持つ", () => {
    expect(sales.headers).toEqual([
      "日付",
      "店舗",
      "商品",
      "数量",
      "単価",
      "売上",
    ]);
    expect(sales.rows).toHaveLength(1092);
    for (const row of sales.rows) {
      expect(Object.keys(row)).toEqual(sales.headers);
    }
  });

  it("型推定: 日付=date、店舗・商品=string、数量・単価・売上=number", () => {
    expect(typesOf(sales.columns)).toEqual({
      日付: "date",
      店舗: "string",
      商品: "string",
      数量: "number",
      単価: "number",
      売上: "number",
    });
    expect(sales.columns.map((c) => c.name)).toEqual(sales.headers);
  });

  it("売上 = 数量 × 単価 が全行で成り立つ（列がずれていない）", () => {
    for (const row of sales.rows) {
      expect(num(row["数量"]) * num(row["単価"])).toBe(num(row["売上"]));
    }
  });

  it("日付は 2024-01-01 〜 2024-03-31、4 店舗 × 3 商品 × 91 日", () => {
    expect(sales.rows[0]["日付"]).toBe("2024-01-01");
    expect(sales.rows.at(-1)["日付"]).toBe("2024-03-31");
    const combos = new Set(sales.rows.map(keyOf));
    expect(combos.size).toBe(12);
    expect(new Set(sales.rows.map((r) => r["日付"])).size).toBe(91);
  });

  it("filterRows: 2024 年 2 月だけにすると 29 日 × 12 = 348 行（うるう年）", () => {
    const feb = filterRows(sales.rows, [
      { column: "日付", op: "contains", value: "2024-02-" },
    ]);
    expect(feb).toHaveLength(348);
    const fromFeb = filterRows(sales.rows, [
      { column: "日付", op: "gte", value: "2024-02-01" },
    ]);
    expect(fromFeb).toHaveLength(1092 - 31 * 12);
    const febByRange = filterRows(sales.rows, [
      { column: "日付", op: "gte", value: "2024-02-01" },
      { column: "日付", op: "lte", value: "2024-02-29" },
    ]);
    expect(febByRange).toHaveLength(348);
  });

  it("filterRows: 店舗 = 新宿店 は 273 行（3 商品 × 91 日）", () => {
    const rows = filterRows(sales.rows, [
      { column: "店舗", op: "eq", value: "新宿店" },
    ]);
    expect(rows).toHaveLength(273);
  });

  it("sortRows: 売上の降順の先頭は、実際の最大値", () => {
    const sorted = sortRows(
      sales.rows,
      { column: "売上", direction: "desc" },
      "number",
    );
    const max = Math.max(...sales.rows.map((r) => num(r["売上"])));
    expect(num(sorted[0]["売上"])).toBe(max);
    expect(sorted).toHaveLength(1092);
    // 元の配列は変わらない
    expect(sales.rows[0]["日付"]).toBe("2024-01-01");
  });

  it("aggregate: 店舗ごとの売上合計。全体は 3,272,140（sales_excel_sjis の合計行と同じ）", () => {
    const result = aggregate(sales.rows, {
      groupBy: ["店舗"],
      metrics: [{ column: "売上", fn: "sum" }, { fn: "count" }],
    });
    expect(result).toHaveLength(4);
    const byStore = Object.fromEntries(result.map((r) => [r["店舗"], r]));
    expect(byStore["新宿店"]["売上_sum"]).toBe(988880);
    expect(byStore["渋谷店"]["売上_sum"]).toBe(870140);
    expect(byStore["池袋店"]["売上_sum"]).toBe(757940);
    expect(byStore["横浜店"]["売上_sum"]).toBe(655180);
    for (const store of SALES_STORES) expect(byStore[store].count).toBe(273);
    expect(sumOf(result.map((r) => r["売上_sum"]))).toBe(
      SJIS_GRAND_TOTAL["合計"],
    );
  });

  it("aggregate: groupBy 空なら全体を 1 行に集計（件数・合計・平均・最小・最大）", () => {
    const [row] = aggregate(sales.rows, {
      groupBy: [],
      metrics: [
        { fn: "count" },
        { column: "売上", fn: "sum" },
        { column: "売上", fn: "avg" },
        { column: "売上", fn: "min" },
        { column: "売上", fn: "max" },
      ],
    });
    const values = sales.rows.map((r) => num(r["売上"]));
    expect(row.count).toBe(1092);
    expect(row["売上_sum"]).toBe(3272140);
    expect(row["売上_avg"]).toBeCloseTo(3272140 / 1092, 6);
    expect(row["売上_min"]).toBe(Math.min(...values));
    expect(row["売上_max"]).toBe(Math.max(...values));
  });

  it("aggregate: 商品ごとの件数は 364（4 店舗 × 91 日）", () => {
    const result = aggregate(sales.rows, {
      groupBy: ["商品"],
      metrics: [{ fn: "count" }],
    });
    expect(result).toHaveLength(3);
    for (const product of SALES_PRODUCTS) {
      expect(result.find((r) => r["商品"] === product).count).toBe(364);
    }
  });

  it("statistics: 売上は 1,092 件・欠損 0。数量・単価も動く", () => {
    const values = sales.rows.map((r) => r["売上"]);
    const stats = statistics(values);
    expect(stats.count).toBe(1092);
    expect(stats.missing).toBe(0);
    expect(stats.mean).toBeCloseTo(3272140 / 1092, 6);
    const nums = values.map(num);
    expect(stats.min).toBe(Math.min(...nums));
    expect(stats.max).toBe(Math.max(...nums));
    expect(stats.stdDev).toBeCloseTo(sampleStdDev(nums), 6);
    expect(statistics(sales.rows.map((r) => r["単価"])).count).toBe(1092);
  });

  it("correlation: 数量・単価・売上の行列が、参照計算と一致（対角 1・対称）", () => {
    const names = ["数量", "単価", "売上"];
    const matrix = correlation(names.map((n) => sales.rows.map((r) => r[n])));
    expect(matrix).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(matrix[i][i]).toBe(1);
      for (let j = 0; j < 3; j++) {
        const expected = pearson(
          sales.rows.map((r) => num(r[names[i]])),
          sales.rows.map((r) => num(r[names[j]])),
        );
        expect(matrix[i][j]).toBeCloseTo(expected, 6);
        expect(matrix[i][j]).toBeCloseTo(matrix[j][i], 12);
      }
    }
  });
});

describe("sales_excel_sjis.csv（Shift_JIS・CRLF・カンマ付き数値・合計行）", () => {
  const sjis = load("sales_excel_sjis.csv");
  const sales = load("sales_2024q1.csv");
  const withoutTotal = filterRows(sjis.rows, [
    { column: "店舗", op: "ne", value: "合計" },
  ]);

  it("ファイルの形: UTF-8 としては読めない。CRLF で、すべての LF の前に CR がある", () => {
    const bytes = readSampleBytes("sales_excel_sjis.csv");
    expect(() =>
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ).toThrow();
    let lf = 0;
    bytes.forEach((b, i) => {
      if (b === 0x0a) {
        lf += 1;
        expect(bytes[i - 1]).toBe(0x0d);
      }
    });
    expect(lf).toBe(14); // ヘッダー＋13 行
  });

  it("文字コードは shift_jis と判定され、文字化け（U+FFFD）がない", () => {
    expect(sjis.encoding).toBe("shift_jis");
    const text = new TextDecoder(sjis.encoding).decode(sjis.buffer);
    expect(text).not.toContain("�");
    expect(text).toContain("新宿店");
    expect(text).toContain("りんご");
  });

  it("13 行・6 列。見出しは 店舗・商品・1月・2月・3月・合計", () => {
    expect(sjis.headers).toEqual(["店舗", "商品", "1月", "2月", "3月", "合計"]);
    expect(sjis.rows).toHaveLength(13);
    for (const row of sjis.rows) {
      expect(Object.keys(row)).toEqual(sjis.headers);
      // CRLF の CR が値に残らない
      for (const v of Object.values(row)) expect(v).not.toMatch(/[\r\n]/);
    }
  });

  it("引用符の中のカンマは区切りにならず、カンマ付きの文字のまま 1 つのセルに入る", () => {
    expect(sjis.rows[0]).toEqual({
      店舗: "新宿店",
      商品: "りんご",
      "1月": "116,040",
      "2月": "92,760",
      "3月": "135,600",
      合計: "344,400",
    });
    expect(sjis.rows.at(-1)).toEqual({
      店舗: "合計",
      商品: "",
      "1月": "1,094,440",
      "2月": "931,520",
      "3月": "1,246,180",
      合計: "3,272,140",
    });
  });

  it("型推定: 店舗・商品=string、1月〜合計=number（カンマ付きでも number）", () => {
    expect(typesOf(sjis.columns)).toEqual({
      店舗: "string",
      商品: "string", // 合計行は空欄だが、残りは文字
      "1月": "number",
      "2月": "number",
      "3月": "number",
      合計: "number",
    });
  });

  it("README: 各月の数字は、sales_2024q1 を 店舗×商品×月 で合計した値と一致する", () => {
    const months = { "1月": "2024-01-", "2月": "2024-02-", "3月": "2024-03-" };
    for (const [month, prefix] of Object.entries(months)) {
      const monthRows = filterRows(sales.rows, [
        { column: "日付", op: "contains", value: prefix },
      ]);
      const grouped = aggregate(monthRows, {
        groupBy: ["店舗", "商品"],
        metrics: [{ column: "売上", fn: "sum" }],
      });
      expect(grouped).toHaveLength(12);
      const fromSales = Object.fromEntries(
        grouped.map((r) => [keyOf(r), r["売上_sum"]]),
      );
      const fromExcel = Object.fromEntries(
        withoutTotal.map((r) => [keyOf(r), num(r[month])]),
      );
      expect(fromExcel).toEqual(fromSales);
    }
  });

  it("README: 「合計」列は、3 か月分の合計と一致する（店舗×商品ごと）", () => {
    const grouped = aggregate(sales.rows, {
      groupBy: ["店舗", "商品"],
      metrics: [{ column: "売上", fn: "sum" }],
    });
    for (const r of grouped) {
      expect(r["売上_sum"]).toBe(SJIS_TOTAL_BY_STORE_PRODUCT[keyOf(r)]);
    }
    for (const row of withoutTotal) {
      expect(num(row["合計"])).toBe(SJIS_TOTAL_BY_STORE_PRODUCT[keyOf(row)]);
      expect(num(row["1月"]) + num(row["2月"]) + num(row["3月"])).toBe(
        num(row["合計"]),
      );
    }
  });

  it("filterRows(ne): 合計行を除くと 12 行（店舗×商品）。合計行は 1 行だけ", () => {
    expect(withoutTotal).toHaveLength(12);
    expect(withoutTotal.some((r) => r["店舗"] === "合計")).toBe(false);
    expect(
      filterRows(sjis.rows, [{ column: "店舗", op: "eq", value: "合計" }]),
    ).toHaveLength(1);
  });

  it("README: 合計行を含めて集計すると 2 倍になる。除けば合計行の数字と一致する", () => {
    const metrics = ["1月", "2月", "3月", "合計"].map((column) => ({
      column,
      fn: "sum",
    }));
    const [doubled] = aggregate(sjis.rows, { groupBy: [], metrics });
    const [correct] = aggregate(withoutTotal, { groupBy: [], metrics });
    for (const [month, total] of Object.entries(SJIS_GRAND_TOTAL)) {
      expect(doubled[`${month}_sum`]).toBe(total * 2);
      expect(correct[`${month}_sum`]).toBe(total);
    }
  });

  it("集計: 合計行を除いて 店舗ごとに合計すると、sales_2024q1 の店舗別合計と同じ", () => {
    const byStore = aggregate(withoutTotal, {
      groupBy: ["店舗"],
      metrics: [{ column: "合計", fn: "sum" }],
    });
    const fromSales = aggregate(sales.rows, {
      groupBy: ["店舗"],
      metrics: [{ column: "売上", fn: "sum" }],
    });
    expect(byStore).toHaveLength(4);
    for (const r of byStore) {
      expect(r["合計_sum"]).toBe(
        fromSales.find((s) => s["店舗"] === r["店舗"])["売上_sum"],
      );
    }
  });

  it("sortRows: カンマ付きの数も数値順（文字順なら 344,400 が先頭に来てしまう）", () => {
    const desc = sortRows(
      sjis.rows,
      { column: "合計", direction: "desc" },
      "number",
    );
    expect(desc[0]["店舗"]).toBe("合計"); // 3,272,140 が最大
    expect(desc[1]["合計"]).toBe("344,400");
    const asc = sortRows(
      withoutTotal,
      { column: "合計", direction: "asc" },
      "number",
    );
    expect(asc[0]["合計"]).toBe("208,240");
  });

  it("sortRows: 商品（文字）の昇順では、空欄の合計行が最後尾", () => {
    const sorted = sortRows(
      sjis.rows,
      { column: "商品", direction: "asc" },
      "string",
    );
    expect(sorted.at(-1)["店舗"]).toBe("合計");
    const desc = sortRows(
      sjis.rows,
      { column: "商品", direction: "desc" },
      "string",
    );
    expect(desc.at(-1)["店舗"]).toBe("合計");
  });

  it("statistics: カンマ付きの数も数値として扱う（合計行を除く 12 件）", () => {
    const values = withoutTotal.map((r) => r["1月"]);
    const stats = statistics(values);
    expect(stats.count).toBe(12);
    expect(stats.missing).toBe(0);
    expect(stats.mean * 12).toBeCloseTo(SJIS_GRAND_TOTAL["1月"], 6);
    const nums = values.map(num);
    expect(stats.min).toBe(Math.min(...nums));
    expect(stats.max).toBe(Math.max(...nums));
    expect(stats.stdDev).toBeCloseTo(sampleStdDev(nums), 6);
    // 合計行を含めると 13 件で、合計行の値が最大になる
    const all = statistics(sjis.rows.map((r) => r["1月"]));
    expect(all.count).toBe(13);
    expect(all.max).toBe(1094440);
  });

  it("statistics: 文字の列（商品）は数値が 0 件で、13 件すべて missing", () => {
    // 数値でない文字列は missing に数える（docs/03 2.7 実装時の決定）
    const stats = statistics(sjis.rows.map((r) => r["商品"]));
    expect(stats.count).toBe(0);
    expect(stats.missing).toBe(13);
  });

  it("correlation: 1月・2月・3月・合計（合計行を除く）が参照計算と一致", () => {
    const names = ["1月", "2月", "3月", "合計"];
    const matrix = correlation(names.map((n) => withoutTotal.map((r) => r[n])));
    for (let i = 0; i < 4; i++) {
      expect(matrix[i][i]).toBe(1);
      for (let j = 0; j < 4; j++) {
        const expected = pearson(
          withoutTotal.map((r) => num(r[names[i]])),
          withoutTotal.map((r) => num(r[names[j]])),
        );
        expect(matrix[i][j]).toBeCloseTo(expected, 6);
      }
    }
  });
});

describe("survey.csv（BOM 付き UTF-8・引用符内の改行・カンマ・二重引用符・空欄）", () => {
  const survey = load("survey.csv");
  const comments = survey.rows.map((r) => r["感想"]);

  it("ファイルの形: BOM 付き・LF（CR を含まない）", () => {
    const bytes = readSampleBytes("survey.csv");
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes.includes(0x0d)).toBe(false);
  });

  it("文字コードは utf-8。BOM は見出しに残らない", () => {
    expect(survey.encoding).toBe("utf-8");
    expect(survey.headers[0]).toBe("回答ID");
    expect(survey.headers[0]).not.toMatch(/﻿/);
  });

  it("200 件・8 列。全行の列数が同じで、列名が見出しと一致（列がずれていない）", () => {
    expect(survey.headers).toEqual([
      "回答ID",
      "回答日時",
      "店舗",
      "年代",
      "満足度",
      "買った商品",
      "感想",
      "再来店",
    ]);
    expect(survey.rows).toHaveLength(200);
    for (const row of survey.rows) {
      expect(Object.keys(row)).toEqual(survey.headers);
      for (const v of Object.values(row)) expect(typeof v).toBe("string");
    }
  });

  it("各列に、その列らしい値が入っている（改行・カンマで列がずれていない）", () => {
    survey.rows.forEach((row, i) => {
      expect(row["回答ID"]).toBe(String(i + 1));
      expect(row["回答日時"]).toMatch(/^2024-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(SALES_STORES).toContain(row["店舗"]);
      expect(["1", "2", "3", "4", "5"]).toContain(row["満足度"]);
      expect(["はい", "いいえ", ""]).toContain(row["再来店"]);
      expect([
        "",
        "10代",
        "20代",
        "30代",
        "40代",
        "50代",
        "60代以上",
      ]).toContain(row["年代"]);
    });
  });

  it("「買った商品」は 1 つのセルに複数（りんご;みかん）。; で分かれない", () => {
    const multi = survey.rows.filter((r) => r["買った商品"].includes(";"));
    expect(multi).toHaveLength(105);
    for (const row of survey.rows) {
      for (const item of row["買った商品"].split(";")) {
        expect(SALES_PRODUCTS).toContain(item);
      }
    }
  });

  it("「感想」が切れない: 改行 14 件・半角カンマ 17 件・二重引用符 18 件が、そのまま 1 セルに入る", () => {
    expect(comments.filter((c) => c.includes("\n"))).toHaveLength(14);
    expect(comments.filter((c) => c.includes(","))).toHaveLength(17);
    expect(comments.filter((c) => c.includes('"'))).toHaveLength(18);
    expect(comments).toContain("駐車場が狭い。\n週末は止められなかった");
    expect(comments).toContain("1,000円以上で袋が無料になると嬉しい");
    expect(comments).toContain('He said "very fresh" — 友人も満足');
    expect(survey.rows[1]["感想"]).toBe(
      "駐車場が狭い。\n週末は止められなかった",
    );
    expect(survey.rows[1]["回答ID"]).toBe("2");
  });

  it("「感想」の値は、全部で 12 種類（空欄を含む）。途中で切れた断片がない", () => {
    expect(new Set(comments)).toEqual(SURVEY_COMMENTS);
  });

  it("空欄の件数: 年代 14・感想 33・再来店 18。ほかの列は 0", () => {
    const blanks = Object.fromEntries(
      survey.headers.map((h) => [
        h,
        survey.rows.filter((r) => r[h] === "").length,
      ]),
    );
    expect(blanks).toEqual({
      回答ID: 0,
      回答日時: 0,
      店舗: 0,
      年代: 14,
      満足度: 0,
      買った商品: 0,
      感想: 33,
      再来店: 18,
    });
  });

  it("型推定: 回答ID・満足度=number。日時（時刻つき）・文字・空欄を含む列=string", () => {
    expect(typesOf(survey.columns)).toEqual({
      回答ID: "number",
      // docs/03 2.3: date は YYYY-MM-DD / YYYY/MM/DD のみ。時刻つきの「2024-01-01 12:51:09」は string
      回答日時: "string",
      店舗: "string",
      年代: "string",
      満足度: "number",
      買った商品: "string",
      感想: "string",
      再来店: "string",
    });
  });

  it("statistics: 満足度は 200 件・平均 3.93・中央値 4・最小 1・最大 5", () => {
    const stats = statistics(survey.rows.map((r) => r["満足度"]));
    expect(stats.count).toBe(200);
    expect(stats.missing).toBe(0);
    expect(stats.mean).toBeCloseTo(3.93, 10);
    expect(stats.median).toBe(4);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
    expect(stats.stdDev).toBeCloseTo(
      sampleStdDev(survey.rows.map((r) => num(r["満足度"]))),
      10,
    );
  });

  it("statistics: 回答ID は 1〜200（平均・中央値 100.5）", () => {
    const stats = statistics(survey.rows.map((r) => r["回答ID"]));
    expect(stats.count).toBe(200);
    expect(stats.mean).toBe(100.5);
    expect(stats.median).toBe(100.5);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(200);
  });

  it("statistics: 空欄は missing に数える（再来店 はい=1・いいえ=0 にした 200 件のうち空欄 18）", () => {
    const values = survey.rows.map((r) =>
      r["再来店"] === "はい"
        ? "1"
        : r["再来店"] === "いいえ"
          ? "0"
          : r["再来店"],
    );
    const stats = statistics(values);
    expect(stats.count).toBe(182);
    expect(stats.missing).toBe(18);
    expect(stats.count + stats.missing).toBe(200);
    expect(stats.mean).toBeCloseTo(145 / 182, 10);
    expect(stats.min).toBe(0);
    expect(stats.max).toBe(1);
  });

  it("statistics: 文字の列（年代）は数値が 0 件で、200 件すべて missing", () => {
    const stats = statistics(survey.rows.map((r) => r["年代"]));
    expect(stats.count).toBe(0);
    expect(stats.missing).toBe(200);
    expect(stats.mean).toBeNull();
  });

  it("correlation: 回答ID と 満足度 の 2×2 が参照計算と一致（対角 1・対称・null でない）", () => {
    const matrix = correlation([
      survey.rows.map((r) => r["回答ID"]),
      survey.rows.map((r) => r["満足度"]),
    ]);
    const expected = pearson(
      survey.rows.map((r) => num(r["回答ID"])),
      survey.rows.map((r) => num(r["満足度"])),
    );
    expect(matrix[0][0]).toBe(1);
    expect(matrix[1][1]).toBe(1);
    expect(matrix[0][1]).not.toBeNull();
    expect(matrix[0][1]).toBeCloseTo(expected, 8);
    expect(matrix[1][0]).toBeCloseTo(expected, 8);
  });

  it("aggregate: 店舗ごとの件数と満足度の平均（参照計算と一致）", () => {
    const result = aggregate(survey.rows, {
      groupBy: ["店舗"],
      metrics: [{ fn: "count" }, { column: "満足度", fn: "avg" }],
    });
    const counts = { 渋谷店: 56, 新宿店: 48, 池袋店: 45, 横浜店: 51 };
    expect(result).toHaveLength(4);
    for (const r of result) {
      expect(r.count).toBe(counts[r["店舗"]]);
      const group = survey.rows.filter((x) => x["店舗"] === r["店舗"]);
      expect(r["満足度_avg"]).toBeCloseTo(
        sumOf(group.map((x) => num(x["満足度"]))) / group.length,
        10,
      );
    }
  });

  it("aggregate: 再来店ごとの件数は はい145・いいえ37・空欄18（空欄も 1 グループ）", () => {
    const result = aggregate(survey.rows, {
      groupBy: ["再来店"],
      metrics: [{ fn: "count" }],
    });
    expect(
      Object.fromEntries(result.map((r) => [r["再来店"], r.count])),
    ).toEqual({ はい: 145, いいえ: 37, "": 18 });
  });

  it("filterRows: 空欄（eq 空文字）・空欄でない（ne 空文字）・改行を含む・二重引用符を含む", () => {
    const count = (filters) => filterRows(survey.rows, filters).length;
    expect(count([{ column: "感想", op: "eq", value: "" }])).toBe(33);
    expect(count([{ column: "年代", op: "eq", value: "" }])).toBe(14);
    expect(count([{ column: "再来店", op: "ne", value: "" }])).toBe(182);
    expect(count([{ column: "感想", op: "contains", value: "\n" }])).toBe(14);
    expect(count([{ column: "感想", op: "contains", value: '"' }])).toBe(18);
    expect(count([{ column: "感想", op: "contains", value: "," }])).toBe(17);
  });

  it("filterRows: 満足度は gte 4 で 143 件、lt 3 で 12 件。複数条件は AND", () => {
    const count = (filters) => filterRows(survey.rows, filters).length;
    expect(count([{ column: "満足度", op: "gte", value: "4" }])).toBe(143);
    expect(count([{ column: "満足度", op: "lt", value: "3" }])).toBe(12);
    expect(
      count([
        { column: "満足度", op: "gte", value: "4" },
        { column: "再来店", op: "eq", value: "いいえ" },
      ]),
    ).toBe(
      survey.rows.filter(
        (r) => num(r["満足度"]) >= 4 && r["再来店"] === "いいえ",
      ).length,
    );
  });

  it("filterRows: 満足度は number 列なので gt 系が使える。感想（string）の gt は InvalidFilterError", () => {
    expect(() =>
      filterRows(survey.rows, [{ column: "感想", op: "gt", value: "a" }]),
    ).toThrow(InvalidFilterError);
  });

  it("sortRows: 満足度の降順の先頭は 5。感想（空欄あり）の昇順・降順とも空欄は最後尾", () => {
    const bySat = sortRows(
      survey.rows,
      { column: "満足度", direction: "desc" },
      "number",
    );
    expect(bySat[0]["満足度"]).toBe("5");
    expect(bySat.at(-1)["満足度"]).toBe("1");
    for (const direction of ["asc", "desc"]) {
      const sorted = sortRows(
        survey.rows,
        { column: "感想", direction },
        "string",
      );
      const tail = sorted.slice(-33);
      expect(tail.every((r) => r["感想"] === "")).toBe(true);
      expect(sorted.slice(0, 167).every((r) => r["感想"] !== "")).toBe(true);
    }
  });
});

describe("Worker 経路（csvParse.worker の handleParseRequest）でも同じ結果", () => {
  it.each(SAMPLE_NAMES)("%s: 手順どおりに読んだ結果と一致する", (name) => {
    const expected = load(name);
    const response = handleParseRequest({
      id: 1,
      buffer: readSampleBuffer(name),
    });
    expect(response.ok).toBe(true);
    expect(response.result.encoding).toBe(expected.encoding);
    expect(response.result.headers).toEqual(expected.headers);
    expect(response.result.rows).toEqual(expected.rows);
    expect(response.result.columns).toEqual(expected.columns);
  });
});
