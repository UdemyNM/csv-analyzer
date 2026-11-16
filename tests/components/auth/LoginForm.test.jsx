// 対象: src/components/auth/LoginForm.jsx（名前付き export { LoginForm }）
// 仕様: docs/05 2 章「ログイン /login: メール＋パスワードのみ（登録画面なし）」、FR-01、docs/04 OQ-1
// 契約: <LoginForm onSignIn={(email, password) => Promise} />
//   - label「メールアドレス」(type=email)、label「パスワード」(type=password)、button「ログイン」
//   - 送信で onSignIn(email, password) を呼ぶ（Enter キーでも送信できる＝form）
//   - onSignIn が reject したら、その Error の message を role=alert に出す
//   - 新規登録・パスワード再設定への導線は置かない
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "../../../src/components/auth/LoginForm.jsx";

describe("LoginForm", () => {
  it("メール・パスワードの入力欄とログインボタンを持つ", () => {
    render(<LoginForm onSignIn={vi.fn()} />);
    expect(screen.getByLabelText("メールアドレス")).toHaveAttribute(
      "type",
      "email",
    );
    expect(screen.getByLabelText("パスワード")).toHaveAttribute(
      "type",
      "password",
    );
    expect(
      screen.getByRole("button", { name: "ログイン" }),
    ).toBeInTheDocument();
  });

  it("入力した値で onSignIn を呼ぶ", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn().mockResolvedValue(undefined);
    render(<LoginForm onSignIn={onSignIn} />);
    await user.type(
      screen.getByLabelText("メールアドレス"),
      "alice@example.com",
    );
    await user.type(screen.getByLabelText("パスワード"), "alice-pass");
    await user.click(screen.getByRole("button", { name: "ログイン" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onSignIn).toHaveBeenCalledWith("alice@example.com", "alice-pass");
  });

  it("パスワード欄で Enter を押しても送信できる", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn().mockResolvedValue(undefined);
    render(<LoginForm onSignIn={onSignIn} />);
    await user.type(screen.getByLabelText("メールアドレス"), "bob@example.com");
    await user.type(screen.getByLabelText("パスワード"), "bob-pass{Enter}");
    expect(onSignIn).toHaveBeenCalledWith("bob@example.com", "bob-pass");
  });

  it("初期状態ではエラーを出さない", () => {
    render(<LoginForm onSignIn={vi.fn()} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ログインに失敗したら、理由を role=alert に出す", async () => {
    const user = userEvent.setup();
    const onSignIn = vi
      .fn()
      .mockRejectedValue(new Error("メールアドレスまたはパスワードが違います"));
    render(<LoginForm onSignIn={onSignIn} />);
    await user.type(
      screen.getByLabelText("メールアドレス"),
      "alice@example.com",
    );
    await user.type(screen.getByLabelText("パスワード"), "wrong");
    await user.click(screen.getByRole("button", { name: "ログイン" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "メールアドレスまたはパスワードが違います",
    );
  });

  it("新規登録・パスワード再設定の導線を持たない（サインアップなし）", () => {
    render(<LoginForm onSignIn={vi.fn()} />);
    expect(
      screen.queryByText(
        /新規登録|サインアップ|アカウント作成|アカウントを作成|パスワードを忘れ|再設定/,
      ),
    ).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
