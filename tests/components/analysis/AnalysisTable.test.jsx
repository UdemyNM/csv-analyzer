// 対象: src/components/analysis/AnalysisTable.jsx（データ表 = DataTable ＋ 列見出しのメニュー）
// 仕様: docs/superpowers/specs/2026-11-16-analysis-page-redesign-design.md 6 章
// 契約:
//   <AnalysisTable columns rows baseRows rowIndexOf settings onSettingsChange(patch) onAddCondition(filter) />
//   - rows: 表に出す行（非表示の行を除く → 絞り込み → 並べ替え 後）
//   - baseRows: 非表示の行を除いただけの行（値の候補を数える元）
//   - settings.hiddenColumns の列は出さない。並べ替え中の列は aria-sort
//   - 値の候補は、ほかの列の条件をかけたあとの baseRows から数える（自分の列の in/notIn は除く）
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnalysisTable } from "../../../src/components/analysis/AnalysisTable.jsx";
import { EMPTY_CONFIG } from "../../../src/components/views/viewConfig.js";
import { buildRowIndex } from "../../../src/utils/hiddenRows.js";
import { col } from "../uiAnalysisHelpers.jsx";

const COLUMNS = [
  col("店舗", "string"),
  col("商品", "string"),
  col("売上", "number"),
];
const ROWS = [
  { 店舗: "東京", 商品: "りんご", 売上: "100" },
  { 店舗: "東京", 商品: "みかん", 売上: "200" },
  { 店舗: "大阪", 商品: "りんご", 売上: "300" },
];

function setup(settingsPatch = {}, props = {}) {
  const onSettingsChange = vi.fn();
  const onAddCondition = vi.fn(() => true);
  const settings = { ...EMPTY_CONFIG, ...settingsPatch };
  render(
    <AnalysisTable
      columns={COLUMNS}
      rows={ROWS}
      baseRows={ROWS}
      rowIndexOf={(row) => buildRowIndex(ROWS).get(row)}
      settings={settings}
      onSettingsChange={onSettingsChange}
      onAddCondition={onAddCondition}
      {...props}
    />,
  );
  return { user: userEvent.setup(), onSettingsChange, onAddCondition };
}

const headerNames = () =>
  screen.getAllByRole("columnheader").map((th) => th.textContent);
const openMenu = async (user, name) => {
  await user.click(
    screen.getByRole("button", {
      name: new RegExp(`「${name}」の列のメニュー`),
    }),
  );
  return screen.getByRole("dialog");
};

describe("AnalysisTable", () => {
  it("hiddenColumns の列は出ない", () => {
    setup({ hiddenColumns: ["商品"] });
    const names = headerNames().join("|");
    expect(names).toContain("店舗");
    expect(names).not.toContain("商品");
  });

  it("並べ替え中の列は aria-sort=descending", () => {
    setup({ sort: { column: "売上", direction: "desc" } });
    const th = screen
      .getAllByRole("columnheader")
      .find((h) => h.textContent.includes("売上"));
    expect(th).toHaveAttribute("aria-sort", "descending");
  });

  it("メニューの「この列を非表示」で hiddenColumns に足す", async () => {
    const { user, onSettingsChange } = setup({ hiddenColumns: ["売上"] });
    const menu = await openMenu(user, "店舗");
    await user.click(
      within(menu).getByRole("button", { name: "この列を非表示" }),
    );
    expect(onSettingsChange).toHaveBeenCalledWith({
      hiddenColumns: ["売上", "店舗"],
    });
  });

  it("メニューの並べ替えで sort を変える", async () => {
    const { user, onSettingsChange } = setup();
    const menu = await openMenu(user, "売上");
    await user.click(within(menu).getByRole("button", { name: "降順" }));
    expect(onSettingsChange).toHaveBeenCalledWith({
      sort: { column: "売上", direction: "desc" },
    });
  });

  it("値から選ぶは、その列の in/notIn を置き換える（ほかの条件は残す）", async () => {
    const { user, onSettingsChange } = setup({
      filters: [
        { column: "売上", op: "gte", value: "0" },
        { column: "店舗", op: "in", values: ["東京"] },
      ],
    });
    const menu = await openMenu(user, "店舗");
    await user.click(
      within(menu).getByRole("checkbox", { name: /^すべて選択/ }),
    );
    await user.click(within(menu).getByRole("checkbox", { name: /^東京/ }));
    await user.click(within(menu).getByRole("button", { name: "適用" }));
    expect(onSettingsChange).toHaveBeenCalledWith({
      filters: [
        { column: "売上", op: "gte", value: "0" },
        // 2 種類から 1 つずつ（同数）なので in
        { column: "店舗", op: "in", values: ["大阪"] },
      ],
    });
  });

  it("値の候補は、ほかの列の条件をかけたあとの行から数える（自分の列の notIn は除く）", async () => {
    const { user } = setup({
      filters: [
        { column: "商品", op: "eq", value: "りんご" },
        { column: "店舗", op: "notIn", values: ["大阪"] },
      ],
    });
    const menu = await openMenu(user, "店舗");
    const labels = within(menu)
      .getAllByRole("checkbox")
      .slice(1)
      .map((c) => c.closest("label").textContent);
    expect(labels).toEqual(["大阪(1)", "東京(1)"]);
  });

  it("自由入力は onAddCondition に渡す", async () => {
    const { user, onAddCondition } = setup();
    const menu = await openMenu(user, "売上");
    await user.click(within(menu).getByRole("radio", { name: "自由入力" }));
    await user.type(within(menu).getByRole("textbox", { name: "値" }), "100");
    await user.click(within(menu).getByRole("button", { name: "追加" }));
    expect(onAddCondition).toHaveBeenCalledWith({
      column: "売上",
      op: "eq",
      value: "100",
    });
  });

  it("行の非表示ボタンで、元の行番号を hiddenRows に足す", async () => {
    const { user, onSettingsChange } = setup({ hiddenRows: [7] });
    await user.click(screen.getByRole("button", { name: "2 行目を非表示" }));
    expect(onSettingsChange).toHaveBeenCalledWith({ hiddenRows: [7, 1] });
  });
});

describe("AnalysisTable: 行を隠してもページを保つ（最終レビュー I2）", () => {
  it("2 ページ目で行を隠しても 2 ページ目のまま。条件が変われば 1 ページ目", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 150 }, (_, i) => ({
      店舗: `店${i}`,
      商品: "x",
      売上: String(i),
    }));
    const index = buildRowIndex(many);
    const props = {
      columns: COLUMNS,
      baseRows: many,
      rowIndexOf: (row) => index.get(row),
      onSettingsChange: vi.fn(),
      onAddCondition: vi.fn(() => true),
    };
    const { rerender } = render(
      <AnalysisTable {...props} rows={many} settings={{ ...EMPTY_CONFIG }} />,
    );
    await user.click(screen.getByRole("button", { name: "次へ" }));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    const hidden = many.filter((_, i) => i !== 120);
    rerender(
      <AnalysisTable
        {...props}
        rows={hidden}
        settings={{ ...EMPTY_CONFIG, hiddenRows: [120] }}
      />,
    );
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    rerender(
      <AnalysisTable
        {...props}
        rows={hidden}
        settings={{
          ...EMPTY_CONFIG,
          hiddenRows: [120],
          sort: { column: "売上", direction: "desc" },
        }}
      />,
    );
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });
});
