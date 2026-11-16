// 対象: src/components/analysis/CollapsibleSection.jsx（名前付き export { CollapsibleSection }）
// 仕様: docs/03 1 章「各セクションは見出し右端の開閉ボタンで表示/非表示（初期状態はすべて開く）」、
//       docs/05 3・5・8 章「見出し（行全体）か右端の開閉ボタンで開閉。aria-expanded と aria-controls を持つ実際のボタン」
// 契約: <CollapsibleSection title="データ表">子要素</CollapsibleSection>
//   - 見出しは heading（title）。開閉ボタンはセクションの見出し行に 1 つだけ（aria-expanded / aria-controls を持つ button）。名前に title を含める
//   - 中身は role="region"（aria-labelledby で title を名前にする）。閉じている間も DOM に残し、hidden にする
//     （aria-controls の参照先が常に存在するため）
//   - 初期は開いている。見出しの文字のクリックでも開閉できる。セクションごとに独立して開閉する
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollapsibleSection } from "../../../src/components/analysis/CollapsibleSection.jsx";

const regionOf = (title) =>
  screen.getByRole("region", { name: title, hidden: true });

describe("CollapsibleSection", () => {
  it("見出しと中身を表示し、初期状態は開いている", () => {
    render(
      <CollapsibleSection title="データ表">
        <p>表の中身</p>
      </CollapsibleSection>,
    );
    expect(
      screen.getByRole("heading", { name: /データ表/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("表の中身")).toBeVisible();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("開閉ボタンは aria-controls で中身（region）を指し、閉じていても参照先がある", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="データ表">
        <p>表の中身</p>
      </CollapsibleSection>,
    );
    const button = screen.getByRole("button");
    const controlled = button.getAttribute("aria-controls");
    expect(controlled).toBeTruthy();
    expect(regionOf("データ表").id).toBe(controlled);

    await user.click(button);
    expect(document.getElementById(controlled)).not.toBeNull();
  });

  it("開閉ボタンを押すと閉じ（aria-expanded=false・中身が見えない）、もう一度押すと開く", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="データ表">
        <p>表の中身</p>
      </CollapsibleSection>,
    );
    const button = screen.getByRole("button");

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(regionOf("データ表")).not.toBeVisible();

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(regionOf("データ表")).toBeVisible();
    expect(screen.getByText("表の中身")).toBeVisible();
  });

  it("見出しの文字をクリックしても開閉する", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="グラフ">
        <p>グラフの中身</p>
      </CollapsibleSection>,
    );
    await user.click(screen.getByText("グラフ"));
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(regionOf("グラフ")).not.toBeVisible();

    await user.click(screen.getByText("グラフ"));
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("複数のセクションは独立して開閉する", async () => {
    const user = userEvent.setup();
    render(
      <>
        <CollapsibleSection title="データ表">
          <p>A</p>
        </CollapsibleSection>
        <CollapsibleSection title="グラフ">
          <p>B</p>
        </CollapsibleSection>
      </>,
    );
    const [first, second] = screen.getAllByRole("button");
    await user.click(first);
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");
    expect(regionOf("グラフ")).toBeVisible();
    expect(first.getAttribute("aria-controls")).not.toBe(
      second.getAttribute("aria-controls"),
    );
  });
});

describe("CollapsibleSection: defaultOpen（設計書 5.1: 統計・相関は初期で閉じる）", () => {
  it("defaultOpen={false} なら最初は閉じていて、押すと開く", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="統計・相関" defaultOpen={false}>
        <p>統計の中身</p>
      </CollapsibleSection>,
    );
    const toggle = screen.getByRole("button");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("統計の中身")).not.toBeVisible();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("統計の中身")).toBeVisible();
  });
});
