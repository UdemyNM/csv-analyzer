// samples トラック共通のテスト補助（テストファイルではない）
// samples/ の実ファイルを、バイト列のまま読む。実装（src/utils）を使わない参照計算も置く。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// vitest はプロジェクト直下で実行する。jsdom 環境では URL の型が合わないため、パスで指す
const SAMPLES_DIR = resolve(process.cwd(), "samples");

export const SAMPLE_NAMES = [
  "sales_2024q1.csv",
  "sales_excel_sjis.csv",
  "survey.csv",
];

/** 実ファイルのバイト列（Node の Buffer） */
export const readSampleBytes = (name) =>
  readFileSync(resolve(SAMPLES_DIR, name));

/** 実ファイルを、そのまま ArrayBuffer にしたもの（ブラウザの file.arrayBuffer() 相当） */
export function readSampleBuffer(name) {
  const bytes = readSampleBytes(name);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
}

/** アップロード用の File（中身は実ファイルのバイト列そのまま） */
export const sampleFile = (name) =>
  new File([readSampleBytes(name)], name, { type: "text/csv" });

/** 「1,234」のようなカンマ付きの文字を数にする（参照計算用。実装の parseNumber は使わない） */
export const num = (text) => Number(String(text).replaceAll(",", ""));

/** ピアソン相関係数（参照計算用）。 xs, ys は同じ長さの数の配列 */
export function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** 標本標準偏差（n-1 で割る。参照計算用） */
export function sampleStdDev(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
}

// ---- samples/README.md に書かれた、実ファイルの事実 ----

export const SALES_STORES = ["新宿店", "渋谷店", "池袋店", "横浜店"];
export const SALES_PRODUCTS = ["りんご", "みかん", "ぶどう"];

/** sales_excel_sjis.csv の「合計」列（店舗×商品の 3 か月合計）。README の表どおり */
export const SJIS_TOTAL_BY_STORE_PRODUCT = {
  "新宿店|りんご": 344400,
  "新宿店|みかん": 318080,
  "新宿店|ぶどう": 326400,
  "渋谷店|りんご": 295200,
  "渋谷店|みかん": 281840,
  "渋谷店|ぶどう": 293100,
  "池袋店|りんご": 260640,
  "池袋店|みかん": 234800,
  "池袋店|ぶどう": 262500,
  "横浜店|りんご": 231840,
  "横浜店|みかん": 208240,
  "横浜店|ぶどう": 215100,
};

/** 合計行（店舗=合計）の数字 */
export const SJIS_GRAND_TOTAL = {
  "1月": 1094440,
  "2月": 931520,
  "3月": 1246180,
  合計: 3272140,
};

export const SURVEY_COMMENTS = new Set([
  "",
  "駐車場が狭い。\n週末は止められなかった",
  "「季節の果物」の棚が見やすい",
  "1,000円以上で袋が無料になると嬉しい",
  "特になし",
  'He said "very fresh" — 友人も満足',
  "みかん、りんご、ぶどうを試食できたのが良かった",
  "レジが混んでいた。もう少し早いと助かる",
  "りんごが甘くておいしかった",
  "また来ます！",
  "店員さんが親切でした",
  "品ぞろえは良いが、ぶどうが少し高い",
]);
