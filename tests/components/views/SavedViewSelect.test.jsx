// 対象: src/components/views/SavedViewSelect.jsx（名前付き export { SavedViewSelect }）
// 仕様: docs/05 2・5 章「ビュー[選択▼]」「他メンバーのビューを開いた場合、設定の変更は自分の画面上だけ」、
//       docs/03 7 章「『編集』は、名前と今の設定で上書きする。削除は window.confirm で確認。他人のビューは選んで見られるが、編集・削除は出さない」
// 契約（細部は本テストで固定。SavedViewList は作らず、この選択欄に統合する）:
//   <SavedViewSelect views={View[]} currentUserId={string} selectedId={string|null}
//                    onSelect={(id|null)=>void} onEdit={(view)=>void} onDelete={(view)=>void} />
//   - select「ビュー」: 先頭に value=""（選択なし）、続けて views を渡された順に option（value=view.id、文字に view.name を含む）
//   - 選ぶと onSelect(view.id)、「選択なし」を選ぶと onSelect(null)。selectedId を選択状態として表示する
//   - 選択中のビューが自分のもの（ownerId === currentUserId）のときだけ、ボタン「ビューを編集」「ビューを削除」を出す。
//     押すと onEdit(view) / onDelete(view)（確認ダイアログは親が出す）。他人のビュー・未選択のときは出さない
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedViewSelect } from "../../../src/components/views/SavedViewSelect.jsx";

const view = (overrides) => ({
  id: "v1",
  datasetId: "d1",
  ownerId: "u-alice",
  name: "東京だけ",
  config: { filters: [], sort: null, aggregation: null, chart: null },
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...overrides,
});
const MINE = view({ id: "v-mine", name: "自分のビュー", ownerId: "u-alice" });
const THEIRS = view({ id: "v-bob", name: "Bobのビュー", ownerId: "u-bob" });

const setup = (props = {}) => {
  const handlers = {
    onSelect: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  };
  const user = userEvent.setup();
  render(
    <SavedViewSelect
      views={[MINE, THEIRS]}
      currentUserId="u-alice"
      selectedId={null}
      {...handlers}
      {...props}
    />,
  );
  return { user, ...handlers };
};

describe("SavedViewSelect: 選択", () => {
  it("先頭に「選択なし」、続けて views を渡された順に出す", () => {
    setup();
    const options = within(
      screen.getByRole("combobox", { name: "ビュー" }),
    ).getAllByRole("option");
    expect(options.map((o) => o.value)).toEqual(["", "v-mine", "v-bob"]);
    expect(options[1]).toHaveTextContent("自分のビュー");
    expect(options[2]).toHaveTextContent("Bobのビュー");
  });

  it("選ぶと onSelect(id)、「選択なし」で onSelect(null)", async () => {
    const { user, onSelect } = setup({ selectedId: "v-mine" });
    await user.selectOptions(
      screen.getByRole("combobox", { name: "ビュー" }),
      "v-bob",
    );
    expect(onSelect).toHaveBeenLastCalledWith("v-bob");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "ビュー" }),
      "",
    );
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("selectedId を選択状態として表示する", () => {
    setup({ selectedId: "v-bob" });
    expect(screen.getByRole("combobox", { name: "ビュー" })).toHaveValue(
      "v-bob",
    );
  });

  it("ビューが 0 件でも壊れない（「選択なし」だけ）", () => {
    setup({ views: [] });
    expect(
      within(screen.getByRole("combobox", { name: "ビュー" })).getAllByRole(
        "option",
      ),
    ).toHaveLength(1);
  });
});

describe("SavedViewSelect: 編集・削除は自分のビューだけ", () => {
  it("自分のビューを選んでいるとき「ビューを編集」「ビューを削除」を出し、押すと view を渡す", async () => {
    const { user, onEdit, onDelete } = setup({ selectedId: "v-mine" });
    await user.click(screen.getByRole("button", { name: "ビューを編集" }));
    expect(onEdit).toHaveBeenCalledWith(MINE);
    await user.click(screen.getByRole("button", { name: "ビューを削除" }));
    expect(onDelete).toHaveBeenCalledWith(MINE);
  });

  it("他人のビューを選んでいるときは、編集・削除を出さない", () => {
    setup({ selectedId: "v-bob" });
    expect(screen.queryByRole("button", { name: "ビューを編集" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ビューを削除" })).toBeNull();
  });

  it("未選択のときは、編集・削除を出さない", () => {
    setup({ selectedId: null });
    expect(screen.queryByRole("button", { name: "ビューを編集" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ビューを削除" })).toBeNull();
  });
});
