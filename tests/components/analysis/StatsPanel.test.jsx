// 対象: src/components/analysis/StatsPanel.jsx（名前付き export { StatsPanel }）
// 仕様: docs/03 2.7（statistics）・1 章「基本統計の列見出しに『？』ボタンを置き、押すと用語の短い解説を表示する」、
//       docs/05 5・8 章「基本統計の列見出し（件数・平均・中央値・標準偏差・最小・最大）の横に『？』ボタン。
//       押すと表の下に短い解説を出し、もう一度押すか×で閉じる。解説は同時に 1 つだけ。aria-label『標準偏差』とは、解説は role=note」
// 契約（細部は本テストで固定）:
//   <StatsPanel columns={[{name,type}]} rows={object[]} />
//   - 数値列（type==='number'）だけを 1 行ずつ表にする（行見出し=列名）。列見出し: 件数・平均・中央値・標準偏差・最小・最大
//     値は utils/statistics の結果（標本標準偏差）。小数の桁数は実装に任せる。null（定義できない値）は「-」などの印で、NaN/null/undefined とは出さない
//   - 各列見出しの横に HelpButton（aria-label『用語』とは）。押すと表の下に HelpNote（role=note）。もう一度押すか閉じるで閉じる。同時に 1 つ
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatsPanel } from "../../../src/components/analysis/StatsPanel.jsx";
import { col, isBlankMark, toNumber } from "../uiAnalysisHelpers.jsx";

const COLUMNS = [
  col("店舗", "string"),
  col("売上", "number"),
  col("日付", "date"),
];
const ROWS = [
  { 店舗: "東京", 売上: "1", 日付: "2024-01-01" },
  { 店舗: "大阪", 売上: "2", 日付: "2024-01-02" },
  { 店舗: "名古屋", 売上: "3", 日付: "2024-01-03" },
  { 店舗: "福岡", 売上: "4", 日付: "2024-01-04" },
  { 店舗: "札幌", 売上: "", 日付: "2024-01-05" },
];

const rowFor = (name) =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .find((r) => within(r).queryByRole("rowheader", { name }));
const cellTexts = (name) =>
  within(rowFor(name))
    .getAllByRole("cell")
    .map((c) => c.textContent);
const headerIndex = (term) =>
  screen
    .getAllByRole("columnheader")
    .findIndex((h) => h.textContent.includes(term));

describe("StatsPanel: 基本統計", () => {
  it("数値列だけを行にする（文字列・日付の列は出さない）", () => {
    render(<StatsPanel columns={COLUMNS} rows={ROWS} />);
    expect(rowFor("売上")).toBeTruthy();
    expect(rowFor("店舗")).toBeUndefined();
    expect(rowFor("日付")).toBeUndefined();
  });

  it("列見出し（件数・平均・中央値・標準偏差・最小・最大）を出す", () => {
    render(<StatsPanel columns={COLUMNS} rows={ROWS} />);
    for (const term of ["件数", "平均", "中央値", "標準偏差", "最小", "最大"]) {
      expect(headerIndex(term)).toBeGreaterThanOrEqual(0);
    }
  });

  it("既知の値: [1,2,3,4] + 空欄 → 件数4・平均2.5・中央値2.5・標準偏差≒1.291（標本）・最小1・最大4", () => {
    render(<StatsPanel columns={COLUMNS} rows={ROWS} />);
    const texts = cellTexts("売上");
    // rowheader は cell に含めない前提。ずれていても、列見出しの添字から rowheader 分を補正して読む
    const offset = screen.getAllByRole("columnheader").length - texts.length;
    const at = (term) => toNumber(texts[headerIndex(term) - offset]);
    expect(at("件数")).toBe(4);
    expect(at("平均")).toBeCloseTo(2.5, 2);
    expect(at("中央値")).toBeCloseTo(2.5, 2);
    expect(at("標準偏差")).toBeCloseTo(1.291, 1);
    expect(at("最小")).toBe(1);
    expect(at("最大")).toBe(4);
  });

  it("欠損数（FR-25）: 空欄と数値でない値を数えて出す。件数（有効値）と合わせて全行数になる", () => {
    render(
      <StatsPanel
        columns={[col("売上", "number")]}
        rows={[{ 売上: "1" }, { 売上: "" }, { 売上: "3" }, { 売上: "" }]}
      />,
    );
    expect(headerIndex("欠損数")).toBeGreaterThanOrEqual(0);
    const texts = cellTexts("売上");
    const offset = screen.getAllByRole("columnheader").length - texts.length;
    expect(toNumber(texts[headerIndex("欠損数") - offset])).toBe(2);
    expect(toNumber(texts[headerIndex("件数") - offset])).toBe(2);
  });

  it("欠損がなければ欠損数は 0", () => {
    render(
      <StatsPanel
        columns={[col("売上", "number")]}
        rows={[{ 売上: "1" }, { 売上: "2" }]}
      />,
    );
    const texts = cellTexts("売上");
    const offset = screen.getAllByRole("columnheader").length - texts.length;
    expect(toNumber(texts[headerIndex("欠損数") - offset])).toBe(0);
  });

  it("有効値が 1 件のとき標準偏差は定義できないので、数値ではなく印を出す", () => {
    render(
      <StatsPanel
        columns={[col("売上", "number")]}
        rows={[{ 売上: "5" }, { 売上: "" }]}
      />,
    );
    const texts = cellTexts("売上");
    const offset = screen.getAllByRole("columnheader").length - texts.length;
    const sd = texts[headerIndex("標準偏差") - offset];
    expect(isBlankMark(sd)).toBe(true);
    expect(document.body.textContent).not.toMatch(/NaN|null|undefined/);
  });

  it("渡された rows だけを集計する（絞り込み後の行）", () => {
    render(
      <StatsPanel
        columns={[col("売上", "number")]}
        rows={[{ 売上: "10" }, { 売上: "20" }]}
      />,
    );
    const texts = cellTexts("売上");
    const offset = screen.getAllByRole("columnheader").length - texts.length;
    expect(toNumber(texts[headerIndex("平均") - offset])).toBeCloseTo(15, 2);
  });
});

describe("StatsPanel: 「？」の解説", () => {
  it("各用語に『用語』とは のボタンがある", () => {
    render(<StatsPanel columns={COLUMNS} rows={ROWS} />);
    for (const term of ["件数", "平均", "中央値", "標準偏差", "最小", "最大"]) {
      expect(
        screen.getByRole("button", { name: `『${term}』とは` }),
      ).toBeInTheDocument();
    }
  });

  it("最初は解説を出さない。押すと role=note で解説が出て、表の下に置かれる", async () => {
    const user = userEvent.setup();
    render(<StatsPanel columns={COLUMNS} rows={ROWS} />);
    expect(screen.queryByRole("note")).toBeNull();
    await user.click(screen.getByRole("button", { name: "『標準偏差』とは" }));
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("平均からのばらつきの大きさ");
    const table = screen.getByRole("table");
    expect(
      table.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "『標準偏差』とは" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("各用語の解説文（件数・平均・中央値・最小・最大）", async () => {
    const user = userEvent.setup();
    render(<StatsPanel columns={COLUMNS} rows={ROWS} />);
    const expected = {
      件数: "空欄を除いたデータの数",
      平均: "全部足して件数で割った値",
      中央値: "小さい順に並べた真ん中の値",
      最小: "一番小さい",
      最大: "大きい値",
    };
    for (const [term, text] of Object.entries(expected)) {
      await user.click(screen.getByRole("button", { name: `『${term}』とは` }));
      expect(screen.getByRole("note")).toHaveTextContent(text);
    }
  });

  it("同じボタンをもう一度押すと閉じる", async () => {
    const user = userEvent.setup();
    render(<StatsPanel columns={COLUMNS} rows={ROWS} />);
    const button = screen.getByRole("button", { name: "『平均』とは" });
    await user.click(button);
    expect(screen.getByRole("note")).toBeInTheDocument();
    await user.click(button);
    expect(screen.queryByRole("note")).toBeNull();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("閉じるボタン（×）で閉じる", async () => {
    const user = userEvent.setup();
    render(<StatsPanel columns={COLUMNS} rows={ROWS} />);
    await user.click(screen.getByRole("button", { name: "『中央値』とは" }));
    await user.click(
      within(screen.getByRole("note")).getByRole("button", { name: /閉じる/ }),
    );
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("解説は同時に 1 つだけ（別の用語を開くと前のが閉じる）", async () => {
    const user = userEvent.setup();
    render(<StatsPanel columns={COLUMNS} rows={ROWS} />);
    await user.click(screen.getByRole("button", { name: "『件数』とは" }));
    await user.click(screen.getByRole("button", { name: "『平均』とは" }));
    const notes = screen.getAllByRole("note");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent("全部足して件数で割った値");
    expect(
      screen.getByRole("button", { name: "『件数』とは" }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});
