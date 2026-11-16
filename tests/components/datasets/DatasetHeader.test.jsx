// 対象: src/components/datasets/DatasetHeader.jsx（名前付き export { DatasetHeader }）
// 仕様: docs/03 7 章「概要欄は『データセット名・公開範囲バッジ・行数×列数・文字コード・作成者』。作成者本人にだけ、
//       公開範囲の切替・名前の変更・削除を出す」、docs/05 2・5 章「公開範囲の変更・削除は作成者にだけ表示する」、FR-14
// 契約（細部は本テストで固定）:
//   <DatasetHeader dataset={Dataset} ownerName={string} rowCount={number} columnCount={number} encoding={string}
//                  isOwner={boolean} onVisibilityChange={(next)=>void} onRename={(name)=>void} onDelete={()=>void}>
//     子要素（ビュー選択・保存ボタンなどを親が差し込む）
//   </DatasetHeader>
//   - データセット名は heading。公開範囲は VisibilityBadge（「公開」/「非公開」）
//   - 概要: 文字に「N 行」「M 列」・文字コード・作成者の表示名を含む
//   - isOwner のときだけ: VisibilityToggle（公開にする/非公開にする）、button「名前を変更」、button「データセットを削除」
//   - 名前の変更: 「名前を変更」→ textbox「データセット名」（今の名前が初期値）と button「保存」→ onRename(新しい名前)
//   - 削除: 「データセットを削除」→ onDelete()（確認ダイアログは親が出す）
//   - 作成者でないときは、これらを一切出さない。子要素はどちらでも出す
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatasetHeader } from "../../../src/components/datasets/DatasetHeader.jsx";

const dataset = (overrides = {}) => ({
  id: "d1",
  ownerId: "u-alice",
  name: "sales.csv",
  visibility: "private",
  meta: { rowCount: 5, encoding: "utf-8", columns: [] },
  fileSize: 100,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...overrides,
});

const setup = (props = {}) => {
  const handlers = {
    onVisibilityChange: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
  };
  const user = userEvent.setup();
  render(
    <DatasetHeader
      dataset={dataset()}
      ownerName="Alice"
      rowCount={1234}
      columnCount={7}
      encoding="shift_jis"
      isOwner={true}
      {...handlers}
      {...props}
    >
      <span>ビュー欄</span>
    </DatasetHeader>,
  );
  return { user, ...handlers };
};

describe("DatasetHeader: 概要", () => {
  it("データセット名・公開範囲バッジ・行数×列数・文字コード・作成者を出す", () => {
    setup({ dataset: dataset({ visibility: "shared" }) });
    expect(
      screen.getByRole("heading", { name: "sales.csv" }),
    ).toBeInTheDocument();
    expect(screen.getByText("公開")).toBeInTheDocument();
    expect(document.body).toHaveTextContent(/1,?234\s*行/);
    expect(document.body).toHaveTextContent(/7\s*列/);
    expect(document.body).toHaveTextContent(/shift[_-]?jis/i);
    expect(document.body).toHaveTextContent("Alice");
  });

  it("private は「非公開」バッジ", () => {
    setup({ dataset: dataset({ visibility: "private" }) });
    expect(screen.getByText("非公開")).toBeInTheDocument();
  });

  it("子要素（ビューの選択・保存など）を出す", () => {
    setup();
    expect(screen.getByText("ビュー欄")).toBeInTheDocument();
  });
});

describe("DatasetHeader: 作成者本人の操作", () => {
  it("private では「公開にする」、押すと onVisibilityChange('shared')", async () => {
    const { user, onVisibilityChange } = setup();
    await user.click(screen.getByRole("button", { name: "公開にする" }));
    expect(onVisibilityChange).toHaveBeenCalledWith("shared");
  });

  it("shared では「非公開にする」、押すと onVisibilityChange('private')", async () => {
    const { user, onVisibilityChange } = setup({
      dataset: dataset({ visibility: "shared" }),
    });
    await user.click(screen.getByRole("button", { name: "非公開にする" }));
    expect(onVisibilityChange).toHaveBeenCalledWith("private");
  });

  it("名前の変更: 入力欄に今の名前が入り、保存で onRename(新しい名前)", async () => {
    const { user, onRename } = setup();
    await user.click(screen.getByRole("button", { name: "名前を変更" }));
    const input = screen.getByRole("textbox", { name: "データセット名" });
    expect(input).toHaveValue("sales.csv");
    await user.clear(input);
    await user.type(input, "売上2024.csv");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(onRename).toHaveBeenCalledWith("売上2024.csv");
  });

  it("削除は onDelete()（確認は親）", async () => {
    const { user, onDelete } = setup();
    await user.click(
      screen.getByRole("button", { name: "データセットを削除" }),
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe("DatasetHeader: 作成者でないとき", () => {
  it("公開範囲の切替・名前の変更・削除を出さない（概要と子要素は出す）", () => {
    setup({ isOwner: false, dataset: dataset({ visibility: "shared" }) });
    expect(screen.queryByRole("button", { name: "公開にする" })).toBeNull();
    expect(screen.queryByRole("button", { name: "非公開にする" })).toBeNull();
    expect(screen.queryByRole("button", { name: "名前を変更" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "データセットを削除" }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: "sales.csv" }),
    ).toBeInTheDocument();
    expect(screen.getByText("公開")).toBeInTheDocument();
    expect(screen.getByText("ビュー欄")).toBeInTheDocument();
  });
});
