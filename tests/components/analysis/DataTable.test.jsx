// 対象: src/components/analysis/DataTable.jsx（名前付き export { DataTable }）
// 仕様: docs/05 5 章「データ表は先頭N行のプレビュー（行数はフィルタ後の件数を併記）。大量行はページングする」、
//       docs/04 Phase 5「大量行は先頭N件＋ページング」、docs/05 6 章「表は横スクロールの箱に入れる」、
//       docs/05 5 章「集計結果の表も 1 ページ 100 行でページング」（AggregatePanel と共通の表）
// 契約（細部は本テストで固定）:
//   <DataTable columns={[{name,type}]} rows={object[]} label? />
//   - 1 ページ 100 行。列の並びは columns の順。セルは rows の値をそのまま文字で出す
//   - table を role="region"・名前 label（既定「データ表の内容」）・tabIndex=0 の横スクロールの箱で包む
//   - 件数: 文字に「N 件」（N は rows の全件数）を含める
//   - ページング: ボタン「前へ」「次へ」と、文字「現在ページ / 総ページ」（例: 1 / 3）。先頭では「前へ」、最終では「次へ」を無効にするか、出さない
//   - rows が変わって現在ページが範囲外になったら、範囲内のページに戻る
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable } from "../../../src/components/analysis/DataTable.jsx";
import { col } from "../uiAnalysisHelpers.jsx";

const COLUMNS = [col("id", "number"), col("店舗", "string")];
const makeRows = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: String(i + 1),
    店舗: `店${i + 1}`,
  }));

const bodyRows = () => {
  const table = screen.getByRole("table");
  return within(table)
    .getAllByRole("row")
    .filter((r) => within(r).queryAllByRole("columnheader").length === 0);
};
const disabledOrAbsent = (name) => {
  const b = screen.queryByRole("button", { name });
  return b === null || b.disabled;
};

describe("DataTable: 表示", () => {
  it("列見出しと行を、columns の順にそのまま出す", () => {
    render(<DataTable columns={COLUMNS} rows={makeRows(3)} />);
    const headers = screen
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headers).toEqual(expect.arrayContaining(["id", "店舗"]));
    expect(headers.indexOf("id")).toBeLessThan(headers.indexOf("店舗"));
    const rows = bodyRows();
    expect(rows).toHaveLength(3);
    const cells = within(rows[1]).getAllByRole("cell");
    expect(cells.map((c) => c.textContent)).toEqual(["2", "店2"]);
  });

  it("列名を固定しない（渡された列を出す）", () => {
    render(
      <DataTable columns={[col("alpha", "string")]} rows={[{ alpha: "x" }]} />,
    );
    expect(
      screen.getByRole("columnheader", { name: "alpha" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "店舗" })).toBeNull();
  });

  it("表は、名前つきの横スクロールの箱（region）に入っている", () => {
    render(<DataTable columns={COLUMNS} rows={makeRows(2)} />);
    const box = screen.getByRole("region", { name: "データ表の内容" });
    expect(within(box).getByRole("table")).toBeInTheDocument();
    expect(box).toHaveAttribute("tabindex", "0");
  });

  it("label で箱の名前を変えられる", () => {
    render(<DataTable columns={COLUMNS} rows={makeRows(2)} label="集計結果" />);
    expect(
      screen.getByRole("region", { name: "集計結果" }),
    ).toBeInTheDocument();
  });

  it("全件数を「N 件」で併記する", () => {
    render(<DataTable columns={COLUMNS} rows={makeRows(250)} />);
    expect(screen.getByText(/250\s*件/)).toBeInTheDocument();
  });

  it("0 行でも見出しだけ出して壊れない", () => {
    render(<DataTable columns={COLUMNS} rows={[]} />);
    expect(
      screen.getByRole("columnheader", { name: "店舗" }),
    ).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(0);
  });
});

describe("DataTable: ページング（1 ページ 100 行）", () => {
  it("250 行は 1 ページ目に先頭 100 行だけ出し、「1 / 3」と出す", () => {
    render(<DataTable columns={COLUMNS} rows={makeRows(250)} />);
    const rows = bodyRows();
    expect(rows).toHaveLength(100);
    expect(within(rows[0]).getAllByRole("cell")[0]).toHaveTextContent("1");
    expect(within(rows[99]).getAllByRole("cell")[1]).toHaveTextContent("店100");
    expect(screen.queryByText("店101")).toBeNull();
    expect(screen.getByText(/1\s*\/\s*3/)).toBeInTheDocument();
    expect(disabledOrAbsent("前へ")).toBe(true);
  });

  it("「次へ」で 101 行目から、最終ページは残りの行だけ（50 行）", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={COLUMNS} rows={makeRows(250)} />);
    await user.click(screen.getByRole("button", { name: "次へ" }));
    let rows = bodyRows();
    expect(rows).toHaveLength(100);
    expect(within(rows[0]).getAllByRole("cell")[1]).toHaveTextContent("店101");
    expect(screen.getByText(/2\s*\/\s*3/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "次へ" }));
    rows = bodyRows();
    expect(rows).toHaveLength(50);
    expect(within(rows[0]).getAllByRole("cell")[1]).toHaveTextContent("店201");
    expect(disabledOrAbsent("次へ")).toBe(true);
  });

  it("「前へ」で戻れる", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={COLUMNS} rows={makeRows(250)} />);
    await user.click(screen.getByRole("button", { name: "次へ" }));
    await user.click(screen.getByRole("button", { name: "前へ" }));
    expect(within(bodyRows()[0]).getAllByRole("cell")[1]).toHaveTextContent(
      "店1",
    );
    expect(screen.getByText(/1\s*\/\s*3/)).toBeInTheDocument();
  });

  it("境界: ちょうど 100 行は 1 ページ（前へ・次へは押せない）", () => {
    render(<DataTable columns={COLUMNS} rows={makeRows(100)} />);
    expect(bodyRows()).toHaveLength(100);
    expect(disabledOrAbsent("次へ")).toBe(true);
    expect(disabledOrAbsent("前へ")).toBe(true);
  });

  it("境界: 101 行は 2 ページ（2 ページ目は 1 行）", async () => {
    const user = userEvent.setup();
    render(<DataTable columns={COLUMNS} rows={makeRows(101)} />);
    expect(bodyRows()).toHaveLength(100);
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("店101")).toBeInTheDocument();
  });

  it("3 ページ目にいて rows が 50 行に減ったら、範囲内のページに戻り、行を出す", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DataTable columns={COLUMNS} rows={makeRows(250)} />,
    );
    await user.click(screen.getByRole("button", { name: "次へ" }));
    await user.click(screen.getByRole("button", { name: "次へ" }));
    rerender(<DataTable columns={COLUMNS} rows={makeRows(50)} />);
    expect(bodyRows()).toHaveLength(50);
    expect(screen.getByText(/50\s*件/)).toBeInTheDocument();
  });
});
