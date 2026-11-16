// 対象: src/components/datasets/VisibilityBadge.jsx（名前付き export { VisibilityBadge }）
// 仕様: docs/05 2・7・8 章「公開範囲バッジ」「色だけで意味を伝えない（公開範囲はバッジの文字でも示す）」
// 契約: <VisibilityBadge visibility="shared" | "private" />  shared →「公開」、private →「非公開」
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VisibilityBadge } from "../../../src/components/datasets/VisibilityBadge.jsx";

describe("VisibilityBadge", () => {
  it("shared は「公開」と文字で示す", () => {
    render(<VisibilityBadge visibility="shared" />);
    expect(screen.getByText("公開")).toBeInTheDocument();
    expect(screen.queryByText("非公開")).toBeNull();
  });

  it("private は「非公開」と文字で示す", () => {
    render(<VisibilityBadge visibility="private" />);
    expect(screen.getByText("非公開")).toBeInTheDocument();
    expect(screen.queryByText("公開")).toBeNull();
  });
});
