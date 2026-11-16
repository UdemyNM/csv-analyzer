// 対象: src/components/analysis/PivotTable.jsx（集計結果の表。設計書 7.3）
// 契約: <PivotTable result={pivot() の戻り値} />
//   - role="region"・名前「集計結果」の横スクロールの箱
//   - 列の枠が空なら 1 段の見出し（行の列名 ＋ 値の表示名）
//   - 列の枠があれば 2 段（上: 列キー、下: 値の表示名）。値が 1 つなら値の段は出さない
//   - 空欄のキーは「（空欄）」。列が 50 を超えたら注記。1 ページ 100 行
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PivotTable } from "../../../src/components/analysis/PivotTable.jsx";
import { pivot } from "../../../src/utils/pivot.js";

const SALES = [
  { 店舗: "東京", 商品: "りんご", 売上: "1000", 数量: "1" },
  { 店舗: "東京", 商品: "みかん", 売上: "500", 数量: "2" },
  { 店舗: "大阪", 商品: "りんご", 売上: "2000", 数量: "3" },
];
const typeOf = (name) =>
  name === "売上" || name === "数量" ? "number" : "string";
const run = (rows, columns, values, data = SALES) =>
  pivot(data, { rows, columns, values }, typeOf);
const sum = (column) => ({ column, fn: "sum" });

const headerRows = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .filter((r) => within(r).queryAllByRole("columnheader").length > 0);
const headerTexts = (row) =>
  within(row)
    .getAllByRole("columnheader")
    .map((th) => th.textContent);
const bodyRows = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .filter((r) => within(r).queryAllByRole("cell").length > 0);

describe("PivotTable", () => {
  it("列の枠が空なら 1 段の見出し（店舗・売上・合計）", () => {
    render(<PivotTable result={run(["店舗"], [], [sum("売上")])} />);
    expect(
      screen.getByRole("region", { name: "集計結果" }),
    ).toBeInTheDocument();
    expect(headerRows()).toHaveLength(1);
    expect(headerTexts(headerRows()[0])).toEqual(["店舗", "売上・合計"]);
    expect(
      within(bodyRows()[0])
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["東京", "1,500"]);
  });

  it("列の枠ありで値が 2 つなら 2 段（上: 列キー、下: 値の名前）", () => {
    render(
      <PivotTable
        result={run(["店舗"], ["商品"], [sum("売上"), sum("数量")])}
      />,
    );
    const [top, bottom] = headerRows();
    expect(headerTexts(top)).toEqual(["店舗", "みかん", "りんご"]);
    expect(headerTexts(bottom)).toEqual([
      "売上・合計",
      "数量・合計",
      "売上・合計",
      "数量・合計",
    ]);
  });

  it("列の枠ありで値が 1 つなら、値の段は出さない", () => {
    render(<PivotTable result={run(["店舗"], ["商品"], [sum("売上")])} />);
    expect(headerRows()).toHaveLength(1);
    expect(headerTexts(headerRows()[0])).toEqual(["店舗", "みかん", "りんご"]);
    // 大阪の みかん は無いので「-」（formatCell の null）
    expect(
      within(bodyRows()[1])
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["大阪", "-", "2,000"]);
  });

  it("空欄のキーは「（空欄）」と出す", () => {
    const data = [{ 店舗: "", 商品: "x", 売上: "1", 数量: "1" }];
    render(<PivotTable result={run(["店舗"], [], [sum("売上")], data)} />);
    expect(within(bodyRows()[0]).getAllByRole("cell")[0]).toHaveTextContent(
      "（空欄）",
    );
  });

  it("列が 60 なら 50 列だけ出し、注記を出す", () => {
    const data = Array.from({ length: 60 }, (_, i) => ({
      店舗: "東京",
      商品: `p${String(i).padStart(2, "0")}`,
      売上: "1",
    }));
    render(
      <PivotTable result={run(["店舗"], ["商品"], [sum("売上")], data)} />,
    );
    expect(headerTexts(headerRows()[0])).toHaveLength(51);
    expect(
      screen.getByText(
        "列が多いため、先頭 50 列だけを表示しています（全 60 列）",
      ),
    ).toBeInTheDocument();
  });

  it("101 グループでページングする", async () => {
    const user = userEvent.setup();
    const data = Array.from({ length: 101 }, (_, i) => ({
      店舗: `店${i}`,
      売上: "1",
    }));
    render(<PivotTable result={run(["店舗"], [], [sum("売上")], data)} />);
    expect(bodyRows()).toHaveLength(100);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(bodyRows()).toHaveLength(1);
  });

  it("値は表と同じ書式（formatCell）で出す", () => {
    const data = [
      { 店舗: "東京", 売上: "1" },
      { 店舗: "東京", 売上: "2" },
      { 店舗: "東京", 売上: "2" },
    ];
    render(
      <PivotTable
        result={run(["店舗"], [], [{ column: "売上", fn: "avg" }], data)}
      />,
    );
    expect(within(bodyRows()[0]).getAllByRole("cell")[1]).toHaveTextContent(
      "1.6667",
    );
  });
});
