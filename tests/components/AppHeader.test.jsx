// 対象: src/components/AppHeader.jsx（名前付き export { AppHeader }）
// 仕様: docs/05 2・4 章「ヘッダー: ロゴ / データ一覧 / 利用者名 / ログアウト」「/upload のルートとヘッダーのリンクを削除」
// 契約: <AppHeader user={{displayName,...}} onSignOut={() => void}>{右側に差し込む部品（擬似ユーザー切替）}</AppHeader>
//   - role=banner（header 要素）。「データ一覧」リンク（/ へ）。利用者名。button「ログアウト」。children をそのまま描画する
//   - アップロードへのリンクは持たない
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AppHeader } from "../../src/components/AppHeader.jsx";

const ALICE = {
  id: "u-alice",
  email: "alice@example.com",
  displayName: "Alice",
};

const renderHeader = (props = {}, children = null) =>
  render(
    <MemoryRouter initialEntries={["/datasets/ds-1"]}>
      <AppHeader user={ALICE} onSignOut={() => {}} {...props}>
        {children}
      </AppHeader>
    </MemoryRouter>,
  );

describe("AppHeader", () => {
  it("banner の中に、データ一覧リンクと利用者名とログアウトがある", () => {
    renderHeader();
    const header = screen.getByRole("banner");
    expect(
      within(header).getByRole("link", { name: "データ一覧" }),
    ).toHaveAttribute("href", "/");
    expect(within(header).getByText("Alice")).toBeInTheDocument();
    expect(
      within(header).getByRole("button", { name: "ログアウト" }),
    ).toBeInTheDocument();
  });

  it("ログアウトを押すと onSignOut を呼ぶ", async () => {
    const onSignOut = vi.fn();
    renderHeader({ onSignOut });
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "ログアウト" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("アップロードへのリンクは持たない（/upload は廃止）", () => {
    renderHeader();
    expect(screen.queryByRole("link", { name: /アップロード/ })).toBeNull();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/upload/);
    }
  });

  it("children（擬似ユーザー切替など）を描画する", () => {
    renderHeader({}, <div data-testid="slot">差し込み</div>);
    expect(
      within(screen.getByRole("banner")).getByTestId("slot"),
    ).toBeInTheDocument();
  });
});
