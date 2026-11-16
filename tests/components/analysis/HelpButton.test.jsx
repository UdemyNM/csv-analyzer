// 対象: src/components/analysis/HelpButton.jsx（名前付き export { HelpButton, HelpNote }）
// 仕様: docs/05 5・8 章
//   「『？』ボタンには『標準偏差』とは のような aria-label を付け、解説は role="note" で出す。閉じるボタンにも aria-label を付ける」
//   「押すと解説を出し、もう一度押すか×で閉じる」
// 契約（見た目だけの部品。開閉の状態と「同時に 1 つ」は親＝StatsPanel などが持つ）:
//   <HelpButton term="標準偏差" expanded={bool} onClick={fn} />
//     - button。aria-label は『標準偏差』とは（『』は二重かぎ括弧）。aria-expanded に expanded を反映する。押すと onClick
//   <HelpNote term="標準偏差" onClose={fn}>解説文</HelpNote>
//     - role="note" で解説文（children）を出す。閉じるボタン（aria-label に「閉じる」を含む button）を押すと onClose
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  HelpButton,
  HelpNote,
} from "../../../src/components/analysis/HelpButton.jsx";

describe("HelpButton", () => {
  it("『用語』とは の aria-label を持つ button で、押すと onClick が呼ばれる", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<HelpButton term="標準偏差" expanded={false} onClick={onClick} />);
    const button = screen.getByRole("button", { name: "『標準偏差』とは" });
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("aria-expanded が expanded を反映する", () => {
    const { rerender } = render(
      <HelpButton term="平均" expanded={false} onClick={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "『平均』とは" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    rerender(<HelpButton term="平均" expanded={true} onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "『平均』とは" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});

describe("HelpNote", () => {
  it("role=note で解説文を出す", () => {
    render(
      <HelpNote term="標準偏差" onClose={() => {}}>
        平均からのばらつきの大きさ
      </HelpNote>,
    );
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("平均からのばらつきの大きさ");
  });

  it("閉じるボタン（aria-label に「閉じる」）を押すと onClose", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <HelpNote term="標準偏差" onClose={onClose}>
        解説
      </HelpNote>,
    );
    await user.click(
      within(screen.getByRole("note")).getByRole("button", { name: /閉じる/ }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
