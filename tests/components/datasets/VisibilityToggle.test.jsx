// 対象: src/components/datasets/VisibilityToggle.jsx（名前付き export { VisibilityToggle }）
// 仕様: docs/05 2 章「詳細画面には『公開にする』を出し、公開中は『非公開にする』を出す」、docs/03 7 章、FR-12
// 契約: <VisibilityToggle visibility="private"|"shared" onChange={(next)=>void} disabled? />
//   - private のとき button「公開にする」→ 押すと onChange('shared')
//   - shared のとき button「非公開にする」→ 押すと onChange('private')
//   - 表示するのは今の状態に応じた 1 つのボタンだけ。disabled のときは押せない
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VisibilityToggle } from "../../../src/components/datasets/VisibilityToggle.jsx";

describe("VisibilityToggle", () => {
  it("private は「公開にする」だけを出し、押すと onChange('shared')", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<VisibilityToggle visibility="private" onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "非公開にする" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "公開にする" }));
    expect(onChange).toHaveBeenCalledWith("shared");
  });

  it("shared は「非公開にする」だけを出し、押すと onChange('private')", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<VisibilityToggle visibility="shared" onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "公開にする" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "非公開にする" }));
    expect(onChange).toHaveBeenCalledWith("private");
  });

  it("disabled のときは押しても onChange を呼ばない", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <VisibilityToggle visibility="private" onChange={onChange} disabled />,
    );
    const button = screen.getByRole("button", { name: "公開にする" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onChange).not.toHaveBeenCalled();
  });
});
