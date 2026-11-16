// 対象: src/components/analysis/CorrelationMatrix.jsx（名前付き export { CorrelationMatrix }）
// 仕様: docs/03 2.8（correlation）・1 章、docs/05 5・8 章
//       「『相関行列』の見出しの横に『？』ボタン。押すと見出しの下に短い解説を出し、もう一度押すか×で閉じる。aria-label『相関』とは、解説は role=note」
// 契約（細部は本テストで固定）:
//   <CorrelationMatrix columns={[{name,type}]} rows={object[]} />
//   - 見出し（heading）「相関行列」。数値列だけを、行・列の見出し（rowheader / columnheader に列名）で対称行列の表にする
//   - セルは相関係数（桁数は実装に任せる）。対角は 1。定義できない（分散 0・有効ペア 2 件未満）は「-」などの印（NaN/null/undefined とは出さない）
//   - 見出しの横に HelpButton（aria-label『相関』とは）。押すと見出しの下（表より前）に HelpNote（role=note）。もう一度押すか閉じるで閉じる
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CorrelationMatrix } from "../../../src/components/analysis/CorrelationMatrix.jsx";
import { col, isBlankMark, toNumber } from "../uiAnalysisHelpers.jsx";

const COLUMNS = [
  col("店舗", "string"),
  col("a", "number"),
  col("b", "number"),
  col("c", "number"),
];
// a と b は完全な正の相関、a と c は完全な負の相関
const ROWS = [
  { 店舗: "東京", a: "1", b: "2", c: "3" },
  { 店舗: "大阪", a: "2", b: "4", c: "2" },
  { 店舗: "名古屋", a: "3", b: "6", c: "1" },
];

/** 行 rowName・列 colName のセルの文字 */
const cellOf = (rowName, colName) => {
  const table = screen.getByRole("table");
  const headers = within(table).getAllByRole("columnheader");
  const colIndex = headers.findIndex((h) => h.textContent.trim() === colName);
  const row = within(table)
    .getAllByRole("row")
    .find((r) => within(r).queryByRole("rowheader", { name: rowName }));
  const cells = within(row).getAllByRole("cell");
  // columnheader に角のセル（空）を含む実装・含まない実装の両方を許す
  const cornerOffset = headers.length - cells.length;
  return cells[colIndex - cornerOffset].textContent;
};

describe("CorrelationMatrix: 相関行列", () => {
  it("見出し「相関行列」と、数値列だけの行・列見出しを出す", () => {
    render(<CorrelationMatrix columns={COLUMNS} rows={ROWS} />);
    expect(
      screen.getByRole("heading", { name: /相関行列/ }),
    ).toBeInTheDocument();
    const table = screen.getByRole("table");
    for (const name of ["a", "b", "c"]) {
      expect(
        within(table).getByRole("rowheader", { name }),
      ).toBeInTheDocument();
      expect(
        within(table).getByRole("columnheader", { name }),
      ).toBeInTheDocument();
    }
    expect(within(table).queryByRole("rowheader", { name: "店舗" })).toBeNull();
    expect(
      within(table).queryByRole("columnheader", { name: "店舗" }),
    ).toBeNull();
  });

  it("対角は 1、a-b は +1、a-c は -1、対称", () => {
    render(<CorrelationMatrix columns={COLUMNS} rows={ROWS} />);
    expect(toNumber(cellOf("a", "a"))).toBeCloseTo(1, 2);
    expect(toNumber(cellOf("b", "b"))).toBeCloseTo(1, 2);
    expect(toNumber(cellOf("a", "b"))).toBeCloseTo(1, 2);
    expect(toNumber(cellOf("b", "a"))).toBeCloseTo(1, 2);
    expect(toNumber(cellOf("a", "c"))).toBeCloseTo(-1, 2);
    expect(toNumber(cellOf("c", "a"))).toBeCloseTo(-1, 2);
  });

  it("分散 0 の列との相関は数値ではなく印を出す（対角は 1 のまま）", () => {
    render(
      <CorrelationMatrix
        columns={[col("a", "number"), col("k", "number")]}
        rows={[
          { a: "1", k: "5" },
          { a: "2", k: "5" },
          { a: "3", k: "5" },
        ]}
      />,
    );
    expect(isBlankMark(cellOf("a", "k"))).toBe(true);
    expect(isBlankMark(cellOf("k", "a"))).toBe(true);
    expect(toNumber(cellOf("k", "k"))).toBeCloseTo(1, 2);
    expect(document.body.textContent).not.toMatch(/NaN|null|undefined/);
  });

  it("空欄は行単位（ペアワイズ）で除いて計算する", () => {
    render(
      <CorrelationMatrix
        columns={[col("a", "number"), col("b", "number")]}
        rows={[
          { a: "1", b: "2" },
          { a: "2", b: "" },
          { a: "3", b: "6" },
          { a: "4", b: "8" },
        ]}
      />,
    );
    expect(toNumber(cellOf("a", "b"))).toBeCloseTo(1, 2);
  });
});

describe("CorrelationMatrix: 「？」の解説", () => {
  it("『相関』とは ボタンを押すと、見出しの下（表より前）に role=note で解説を出す", async () => {
    const user = userEvent.setup();
    render(<CorrelationMatrix columns={COLUMNS} rows={ROWS} />);
    expect(screen.queryByRole("note")).toBeNull();
    const button = screen.getByRole("button", { name: "『相関』とは" });
    await user.click(button);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("2つの列が一緒に増減する強さ");
    const heading = screen.getByRole("heading", { name: /相関行列/ });
    const table = screen.getByRole("table");
    expect(
      heading.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      note.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(button).toHaveAttribute("aria-expanded", "true");
  });

  it("もう一度押すと閉じる", async () => {
    const user = userEvent.setup();
    render(<CorrelationMatrix columns={COLUMNS} rows={ROWS} />);
    const button = screen.getByRole("button", { name: "『相関』とは" });
    await user.click(button);
    await user.click(button);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("閉じるボタン（×）で閉じる", async () => {
    const user = userEvent.setup();
    render(<CorrelationMatrix columns={COLUMNS} rows={ROWS} />);
    await user.click(screen.getByRole("button", { name: "『相関』とは" }));
    await user.click(
      within(screen.getByRole("note")).getByRole("button", { name: /閉じる/ }),
    );
    expect(screen.queryByRole("note")).toBeNull();
  });
});
