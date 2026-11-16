// 対象: src/components/auth/UserSwitcher.jsx（名前付き export { UserSwitcher }）
// 仕様: docs/02 2.1「擬似ユーザー切替」、docs/04 Phase 3・6（擬似ユーザー切替で共有・権限を確認）
// 契約: <UserSwitcher auth={AuthRepository} />
//   - auth.switchUser と auth.listUsers がある（= LocalAuth）ときだけ描画する。無ければ何も描画しない
//     （本番の認証にパスワードなしの切替口を出さないため）
//   - role=combobox（アクセシブルネームに「ユーザー」を含む select）。選択肢は listUsers() の displayName
//   - 現在のユーザーが選ばれている。選び直すと auth.switchUser(id)。auth 側の変化（onAuthChange）にも追従する
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserSwitcher } from "../../../src/components/auth/UserSwitcher.jsx";
import { LocalAuth } from "../../../src/repositories/local/LocalAuth.js";
import { USERS } from "../../repositories/contract/fixtures.js";

const signedIn = async (key) => {
  const auth = new LocalAuth({ users: USERS });
  const u = USERS.find((x) => x.id === `u-${key}`);
  await auth.signIn(u.email, u.password);
  return auth;
};

describe("UserSwitcher", () => {
  it("全ユーザーを選択肢に出し、現在のユーザーを選んだ状態にする", async () => {
    const auth = await signedIn("alice");
    render(<UserSwitcher auth={auth} />);
    const select = await screen.findByRole("combobox", { name: /ユーザー/ });
    const labels = within(select)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(labels).toEqual(["Alice", "Bob", "Carol"]);
    expect(select).toHaveValue("u-alice");
  });

  it("別のユーザーを選ぶと switchUser で切り替わり、選択状態も更新される", async () => {
    const user = userEvent.setup();
    const auth = await signedIn("alice");
    render(<UserSwitcher auth={auth} />);
    const select = await screen.findByRole("combobox", { name: /ユーザー/ });
    await user.selectOptions(select, "Bob");
    expect((await auth.getCurrentUser()).id).toBe("u-bob");
    expect(select).toHaveValue("u-bob");
  });

  it("auth 側でユーザーが変わったら、選択状態も追従する", async () => {
    const auth = await signedIn("alice");
    render(<UserSwitcher auth={auth} />);
    const select = await screen.findByRole("combobox", { name: /ユーザー/ });
    await act(async () => {
      await auth.switchUser("u-carol");
    });
    expect(select).toHaveValue("u-carol");
  });

  it("switchUser / listUsers を持たない認証（本番想定）では何も描画しない", () => {
    const auth = {
      getCurrentUser: vi.fn().mockResolvedValue(null),
      onAuthChange: vi.fn(() => () => {}),
    };
    const { container } = render(<UserSwitcher auth={auth} />);
    expect(container).toBeEmptyDOMElement();
  });
});
