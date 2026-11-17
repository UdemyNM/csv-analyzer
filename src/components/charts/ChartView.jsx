import { memo, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { parseNumber } from "../../utils/parseValue.js";
import { formatCell } from "../analysis/formatCell.js";

/** 描く点の上限。Recharts は 1 点あたり約 0.15〜0.45ms かかるため（docs/05 5 章） */
export const MAX_POINTS = 2000;
/** 折れ線は、これを超える点数では点（dot）を描かない（docs/03 7 章） */
const DOT_LIMIT = 100;
/**
 * 棒・折れ線の点がこれを超えたら、X 軸のラベルを数値 interval で間引く。
 * Recharts の自動間引き（既定）は、目盛りごとに文字幅を DOM で測る（1 点ごとに強制レイアウト）ため、
 * 2,000 点で 1.2〜1.4 秒メインスレッドが止まる（25 万行の集計結果を描く実測）。数値 interval は計測しない。
 * ラベルの数は、チャートの幅（ResponsiveContainer の onResize）とラベルの幅の目安から決める。
 */
const TICK_THIN_LIMIT = 100;
const CHAR_PX = 8; // 1 文字の幅の目安。全角は 2 文字ぶんで数える
const TICK_GAP_PX = 12; // ラベルどうしの余白
const AXIS_PX = 80; // Y 軸と左右の余白ぶん
const MIN_TICKS = 2; // 幅が分かるまで（最初の描画）と、狭い幅での個数
const MAX_TICKS = 8;
const CHART_HEIGHT = 320;
const COLORS = [
  "#2a55d6",
  "#0f766e",
  "#b4472a",
  "#7c3aed",
  "#b45309",
  "#0e7490",
  "#be185d",
  "#4d7c0f",
];

export const TYPE_LABELS = {
  bar: "棒グラフ",
  line: "折れ線グラフ",
  pie: "円グラフ",
  scatter: "散布図",
};

/** 系列名を「・」でつなぐ。3 つを超えたら「ほか N」 */
const listNames = (series) =>
  series.length > 3
    ? `${series
        .slice(0, 3)
        .map((s) => s.name)
        .join("・")} ほか ${series.length - 3}`
    : series.map((s) => s.name).join("・");

/** 文字列（CSV そのまま。1,234 も可）でも数値（集計結果）でも、数値として読む。読めなければ null */
const toNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return parseNumber(value);
};

/** ラベル文字列の幅の目安（px） */
const labelPx = (text) =>
  Array.from(text).reduce((w, ch) => w + (ch.charCodeAt(0) > 255 ? 2 : 1), 0) *
  CHAR_PX;

/** 幅 width のチャートに、重ならずに置けるラベルの数（MIN_TICKS〜MAX_TICKS） */
const tickCountFor = (width, maxLabelPx) =>
  Math.max(
    MIN_TICKS,
    Math.min(
      MAX_TICKS,
      Math.floor((width - AXIS_PX) / (maxLabelPx + TICK_GAP_PX)),
    ),
  );

/** 先頭（と末尾）を含めて、max 件になるよう等間隔に取る */
function sampleEvenly(rows, max) {
  if (rows.length <= max) return rows;
  const last = rows.length - 1;
  return Array.from(
    { length: max },
    (_, i) => rows[Math.round((i * last) / (max - 1))],
  );
}

/**
 * グラフ本体（棒・折れ線・円・散布図）。
 * 2,000 点を超えるときは等間隔に間引き、グラフの下に注記する。
 * role="img" と aria-label（種類・X・Y の列名）を付ける。
 * series を渡すと複数の系列を描く（ピボットグラフ。設計書 8.2）: rows の各行の series[i].key の値を系列 i とする。
 * そのとき y は使わず、aria-label には X 軸の名前（xName）と系列名を並べる。円は最初の系列だけを描く。
 *
 * @param {{type: 'bar'|'line'|'pie'|'scatter', rows: object[], x: string, y?: string,
 *   xName?: string, series?: {key: string, name: string}[]}} props
 */
function ChartViewBase({ type, rows, x, y, xName, series }) {
  const lines = useMemo(() => series ?? [{ key: "y", name: y }], [series, y]);
  const sampled = rows.length > MAX_POINTS;
  const data = useMemo(() => {
    const picked = sampleEvenly(rows, MAX_POINTS);
    if (type === "scatter") {
      return picked
        .map((row) => ({ x: toNumber(row[x]), y: toNumber(row[y]) }))
        .filter((p) => p.x !== null && p.y !== null);
    }
    const points = picked.map((row) => {
      const point = { x: String(row[x] ?? "") };
      if (series) {
        for (const s of series) point[s.key] = toNumber(row[s.key]);
      } else {
        point.y = toNumber(row[y]);
      }
      return point;
    });
    // 円は、正の値だけが割合として意味を持つ（最初の系列だけ）
    const first = lines[0].key;
    return type === "pie"
      ? points.filter((p) => p[first] !== null && p[first] > 0)
      : points;
  }, [rows, type, x, y, series, lines]);

  const color = COLORS[0];
  const label = series
    ? `${TYPE_LABELS[type] ?? type}: X軸 ${xName ?? x}、系列 ${listNames(series)}`
    : `${TYPE_LABELS[type] ?? type}: X軸 ${x}、Y軸 ${y}`;
  const legend = lines.length > 1 ? <Legend /> : null;
  // 点が多い棒・折れ線だけ、チャートの幅を追ってラベルの数を決める（それ以外は Recharts の自動のまま）
  const [width, setWidth] = useState(0);
  const thin =
    (type === "bar" || type === "line") && data.length > TICK_THIN_LIMIT;
  const maxLabelPx = useMemo(
    () => (thin ? data.reduce((m, p) => Math.max(m, labelPx(p.x)), 0) : 0),
    [thin, data],
  );
  // interval=N は「(N+1) 個おき」に表示する。undefined は Recharts の自動（重なりを避けて間引く）
  const xInterval = thin
    ? Math.ceil(
        data.length / (width > 0 ? tickCountFor(width, maxLabelPx) : MIN_TICKS),
      ) - 1
    : undefined;

  let chart;
  if (type === "bar") {
    chart = (
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="x" interval={xInterval} />
        <YAxis />
        <Tooltip />
        {legend}
        {lines.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            fill={COLORS[i % COLORS.length]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    );
  } else if (type === "line") {
    chart = (
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="x" interval={xInterval} />
        <YAxis />
        <Tooltip />
        {legend}
        {lines.map((s, i) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stroke={COLORS[i % COLORS.length]}
            dot={data.length > DOT_LIMIT ? false : true}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    );
  } else if (type === "pie") {
    chart = (
      <PieChart>
        <Tooltip />
        <Legend />
        <Pie
          data={data}
          dataKey={lines[0].key}
          nameKey="x"
          isAnimationActive={false}
          // スマホ幅でも外側のラベルが切れないよう、半径を小さめにし、値は表と同じ書式（小数 4 桁まで）で出す
          outerRadius="60%"
          label={data.length <= 12 ? ({ value }) => formatCell(value) : false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    );
  } else {
    chart = (
      <ScatterChart>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" dataKey="x" name={x} />
        <YAxis type="number" dataKey="y" name={y} />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} />
        <Scatter data={data} fill={color} isAnimationActive={false} />
      </ScatterChart>
    );
  }

  return (
    <figure className="chart">
      <div role="img" aria-label={label} className="chart__canvas">
        <ResponsiveContainer
          width="100%"
          height={CHART_HEIGHT}
          onResize={thin ? (w) => setWidth(Math.round(w)) : undefined}
        >
          {chart}
        </ResponsiveContainer>
      </div>
      {sampled && (
        <figcaption className="chart__note muted">
          {`全 ${rows.length.toLocaleString("ja-JP")} 件のうち ${MAX_POINTS.toLocaleString("ja-JP")} 件を間引いて表示しています`}
        </figcaption>
      )}
    </figure>
  );
}

export const ChartView = memo(ChartViewBase);
