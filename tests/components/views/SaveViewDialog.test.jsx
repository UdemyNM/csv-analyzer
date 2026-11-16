// 対象: src/components/views/SaveViewDialog.jsx（名前付き export { SaveViewDialog }）
// 仕様: docs/03 5 章「保存時に、参照列がデータセットの列に存在するか検証」、docs/03 7 章「『編集』は、名前と今の設定で上書きする」、
//       docs/05 5 章「ビュー保存時は、フィルタ・並べ替え・集計・グラフ設定（views.config）を保存する」
// 契約（細部は本テストで固定）:
//   <SaveViewDialog mode="create"|"edit" initialName? config={{filters,sort,hiddenRows,hiddenColumns,pivot,chart}} columnNames={string[]}
//                   onSubmit={(name)=>void} onCancel={()=>void} />
//   - マウントされている間だけ開いているダイアログ（開閉は親）。role="dialog"、textbox「ビュー名」（initialName が初期値）、button「保存」「キャンセル」
//   - 「保存」: 検証が通れば onSubmit(入力した名前)。通らなければ onSubmit は呼ばず、role="alert" に理由（存在しない列名を含む）を出す
//   - 検証: config が参照する列が columnNames に存在するか。対象は
//       filters[].column / sort.column / hiddenColumns[] / pivot.rows・columns・values[].column（count は column 省略可）/ chart.scatter。
//       （設計書 docs/superpowers/specs/2026-11-16-analysis-page-redesign-design.md 9 章）
//   - sort / pivot / chart が null でも保存できる
//   - 保存の実行（ViewRepository の create / update）と、成功後に閉じることは親の責務
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaveViewDialog } from "../../../src/components/views/SaveViewDialog.jsx";
import { EMPTY_CONFIG as EMPTY } from "../../../src/components/views/viewConfig.js";

const COLUMN_NAMES = ["店舗", "商品", "数量", "売上", "日付"];
const VALID = {
  filters: [{ column: "店舗", op: "eq", value: "東京" }],
  sort: { column: "売上", direction: "desc" },
  hiddenRows: [0],
  hiddenColumns: ["日付"],
  pivot: {
    rows: ["店舗"],
    columns: ["商品"],
    values: [{ column: "売上", fn: "sum" }],
  },
  chart: { type: "bar", scatter: { x: "数量", y: "売上" } },
};

const setup = (props = {}) => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const user = userEvent.setup();
  render(
    <SaveViewDialog
      mode="create"
      config={VALID}
      columnNames={COLUMN_NAMES}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { user, onSubmit, onCancel };
};

const nameBox = () => screen.getByRole("textbox", { name: "ビュー名" });
const save = () => screen.getByRole("button", { name: "保存" });

describe("SaveViewDialog: 表示と保存", () => {
  it("role=dialog に、ビュー名の入力欄・保存・キャンセルがある", () => {
    setup();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(nameBox()).toHaveValue("");
    expect(save()).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "キャンセル" }),
    ).toBeInTheDocument();
  });

  it("名前を入れて「保存」で onSubmit(名前)", async () => {
    const { user, onSubmit } = setup();
    await user.type(nameBox(), "東京の売上");
    await user.click(save());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("東京の売上");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("編集モードは initialName を入力欄の初期値にする", async () => {
    const { user, onSubmit } = setup({ mode: "edit", initialName: "旧名" });
    expect(nameBox()).toHaveValue("旧名");
    await user.clear(nameBox());
    await user.type(nameBox(), "新名");
    await user.click(save());
    expect(onSubmit).toHaveBeenCalledWith("新名");
  });

  it("名前が空（空白だけ）のときは onSubmit を呼ばず、alert で入力を促す（FR-30: 名前を付けて保存）", async () => {
    const { user, onSubmit } = setup();
    await user.click(save());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("ビュー名");
    await user.type(nameBox(), "   ");
    await user.click(save());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("キャンセルで onCancel（onSubmit は呼ばない）", async () => {
    const { user, onSubmit, onCancel } = setup();
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sort / pivot / chart が null でも保存できる", async () => {
    const { user, onSubmit } = setup({
      config: { ...EMPTY, chart: null },
    });
    await user.type(nameBox(), "素のビュー");
    await user.click(save());
    expect(onSubmit).toHaveBeenCalledWith("素のビュー");
  });

  it("count の指標は column が無くても保存できる", async () => {
    const { user, onSubmit } = setup({
      config: {
        ...EMPTY,
        filters: [],
        sort: null,
        pivot: { rows: ["店舗"], columns: [], values: [{ fn: "count" }] },
      },
    });
    await user.type(nameBox(), "件数");
    await user.click(save());
    expect(onSubmit).toHaveBeenCalledWith("件数");
  });
});

describe("SaveViewDialog: 参照列の検証", () => {
  it.each([
    [
      "filters の列",
      {
        ...EMPTY,
        filters: [{ column: "ghost", op: "eq", value: "x" }],
        sort: null,
      },
    ],
    [
      "sort の列",
      {
        ...EMPTY,
        filters: [],
        sort: { column: "ghost", direction: "asc" },
      },
    ],
    [
      "pivot.rows の列",
      { ...EMPTY, pivot: { rows: ["ghost"], columns: [], values: [] } },
    ],
    [
      "pivot.columns の列",
      { ...EMPTY, pivot: { rows: [], columns: ["ghost"], values: [] } },
    ],
    ["hiddenColumns の列", { ...EMPTY, hiddenColumns: ["ghost"] }],
    [
      "chart.scatter の列",
      {
        ...EMPTY,
        chart: { type: "scatter", scatter: { x: "ghost", y: "売上" } },
      },
    ],
    [
      "pivot.values の列",
      {
        ...EMPTY,
        pivot: {
          rows: [],
          columns: [],
          values: [{ column: "ghost", fn: "sum" }],
        },
      },
    ],
  ])(
    "%s がデータセットに無いと、保存せずに alert で列名を示す",
    async (_label, config) => {
      const { user, onSubmit } = setup({ config });
      await user.type(nameBox(), "壊れたビュー");
      await user.click(save());
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByRole("alert")).toHaveTextContent("ghost");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    },
  );

  it("存在しない列が複数あっても、すべて示す", async () => {
    const { user, onSubmit } = setup({
      config: {
        ...EMPTY,
        filters: [{ column: "ghost1", op: "eq", value: "x" }],
        sort: { column: "ghost2", direction: "asc" },
      },
    });
    await user.type(nameBox(), "x");
    await user.click(save());
    expect(onSubmit).not.toHaveBeenCalled();
    const text = screen.getByRole("alert").textContent;
    expect(text).toContain("ghost1");
    expect(text).toContain("ghost2");
  });

  it("新しい形の設定（pivot・非表示・散布図）がすべてデータにあれば保存できる", async () => {
    const { user, onSubmit } = setup();
    await user.type(nameBox(), "集計グラフ");
    await user.click(save());
    expect(onSubmit).toHaveBeenCalledWith("集計グラフ");
  });
});
