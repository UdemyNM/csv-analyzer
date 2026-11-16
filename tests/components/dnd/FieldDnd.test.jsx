// 対象: src/components/dnd/FieldDnd.jsx（列名のドラッグ＆ドロップの土台。設計書 7.1）
// 契約:
//   <FieldDndProvider onMove={(move) => void}> … </FieldDndProvider>   // @dnd-kit/react の DragDropProvider
//   <DraggableField field from surface>…</DraggableField>               // 列名をドラッグできる
//   <FieldSlot slot surface label items addOptions onAdd onRemove renderChipExtra? />
//   handleDragEnd(event, onMove): event.operation.source.data = { field, from }、target.data = { slot, index? }
//   列名は id に入れず data でだけ運ぶ（記号を含む列名でも壊れない）
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DraggableField,
  FieldDndProvider,
  FieldSlot,
  handleDragEnd,
} from "../../../src/components/dnd/FieldDnd.jsx";

const OPTIONS = [
  { name: "店舗", type: "string" },
  { name: "売上:税込", type: "number" },
];

function renderSlot(props = {}) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  render(
    <FieldDndProvider onMove={() => {}}>
      <FieldSlot
        slot="rows"
        surface="pivot"
        label="行"
        items={[
          { field: "商品", label: "商品" },
          { field: "売上:税込", label: "売上:税込" },
        ]}
        addOptions={OPTIONS}
        onAdd={onAdd}
        onRemove={onRemove}
        {...props}
      />
    </FieldDndProvider>,
  );
  return { user: userEvent.setup(), onAdd, onRemove };
}

describe("FieldDndProvider", () => {
  it("@dnd-kit/react を使った Provider と DraggableField が jsdom で描ける", () => {
    render(
      <FieldDndProvider onMove={() => {}}>
        <DraggableField field="店舗" from={null} surface="list">
          店舗
        </DraggableField>
      </FieldDndProvider>,
    );
    expect(screen.getByText("店舗")).toBeInTheDocument();
  });
});

describe("FieldSlot", () => {
  it("枠の名前つきグループに、items をチップで出す", () => {
    renderSlot();
    const group = screen.getByRole("group", { name: "行" });
    expect(within(group).getByText("商品")).toBeInTheDocument();
    expect(within(group).getByText("売上:税込")).toBeInTheDocument();
  });

  it("× で onRemove(index)。記号を含む列名でも正しい位置（Review Focus 1）", async () => {
    const { user, onRemove } = renderSlot();
    await user.click(
      screen.getByRole("button", { name: "行から「売上:税込」を外す" }),
    );
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it("「＋」→ 列を選ぶと onAdd(列名)", async () => {
    const { user, onAdd } = renderSlot();
    await user.click(screen.getByRole("button", { name: "行に列を追加" }));
    await user.click(
      within(screen.getByRole("list", { name: "行に追加する列" })).getByRole(
        "button",
        { name: "売上:税込" },
      ),
    );
    expect(onAdd).toHaveBeenCalledWith("売上:税込");
    expect(
      screen.queryByRole("button", { name: "店舗" }),
    ).not.toBeInTheDocument();
  });

  it("キーボードだけで「＋」→ 選択 → 追加ができ、Esc で一覧を閉じる", async () => {
    const { user, onAdd } = renderSlot();
    screen.getByRole("button", { name: "行に列を追加" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "店舗" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onAdd).toHaveBeenCalledWith("店舗");
    await user.click(screen.getByRole("button", { name: "行に列を追加" }));
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("button", { name: "店舗" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "行に列を追加" })).toHaveFocus();
  });

  it("items が空なら「ここに列を置く」と案内する", () => {
    renderSlot({ items: [] });
    expect(screen.getByText("ここに列を置く")).toBeInTheDocument();
  });

  it("renderChipExtra をチップに差し込める", () => {
    renderSlot({ renderChipExtra: (item, i) => <span>{`追加${i}`}</span> });
    expect(screen.getByText("追加1")).toBeInTheDocument();
  });
});

describe("handleDragEnd", () => {
  const drag = (sourceData, targetData, canceled = false) => ({
    canceled,
    operation: {
      source: { id: "x", data: sourceData },
      target: targetData === null ? null : { id: "y", data: targetData },
    },
  });

  it("source.data と target.data から onMove の引数を作る", () => {
    const onMove = vi.fn();
    handleDragEnd(
      drag(
        { field: "売上:税込", from: { slot: "rows", index: 1 } },
        { slot: "values", index: 0 },
      ),
      onMove,
    );
    expect(onMove).toHaveBeenCalledWith({
      field: "売上:税込",
      from: { slot: "rows", index: 1 },
      to: { slot: "values", index: 0 },
    });
  });

  it("枠そのもの（index なし）に落とすと to.index は無し", () => {
    const onMove = vi.fn();
    handleDragEnd(
      drag({ field: "店舗", from: null }, { slot: "rows" }),
      onMove,
    );
    expect(onMove).toHaveBeenCalledWith({
      field: "店舗",
      from: null,
      to: { slot: "rows" },
    });
  });

  it("canceled なら呼ばない", () => {
    const onMove = vi.fn();
    handleDragEnd(
      drag({ field: "店舗", from: null }, { slot: "rows" }, true),
      onMove,
    );
    expect(onMove).not.toHaveBeenCalled();
  });

  it("target が無ければ to: null（枠の外）", () => {
    const onMove = vi.fn();
    handleDragEnd(
      drag({ field: "店舗", from: { slot: "rows", index: 0 } }, null),
      onMove,
    );
    expect(onMove).toHaveBeenCalledWith({
      field: "店舗",
      from: { slot: "rows", index: 0 },
      to: null,
    });
  });

  it("列名を運んでいない source（ほかのドラッグ）は無視する", () => {
    const onMove = vi.fn();
    handleDragEnd(drag({}, { slot: "rows" }), onMove);
    expect(onMove).not.toHaveBeenCalled();
  });
});
