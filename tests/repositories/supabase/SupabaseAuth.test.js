// 対象: src/repositories/supabase/SupabaseAuth.js（AuthRepository の Supabase 実装）
// 仕様: docs/01 FR-01（メール＋パスワード。サインアップはアプリに無い。ユーザーは管理者が Supabase で作る）、
//       src/repositories/types.js の AuthRepository
// 契約:
//   new SupabaseAuth({ client })   client は createClient() の戻り値（ここでは偽物）
//   - User は { id, email, displayName }。displayName は user_metadata.display_name、無ければメールアドレス
//   - ログイン失敗の理由は区別しない（アカウントの有無を漏らさない）
import { describe, it, expect, vi } from "vitest";
import { SupabaseAuth } from "../../../src/repositories/supabase/SupabaseAuth.js";
import { describeAuthRepositoryContract } from "../contract/authRepository.contract.js";
import { USERS } from "../contract/fixtures.js";
import { createFakeSupabaseClient } from "./fakeSupabaseClient.js";

const tick = () => new Promise((r) => setTimeout(r, 0));

const makeEnv = (options = {}) => {
  const client = createFakeSupabaseClient({ users: USERS, ...options });
  return { auth: new SupabaseAuth({ client }), client, users: USERS };
};

describeAuthRepositoryContract("SupabaseAuth（偽クライアント）", async () =>
  makeEnv(),
);

describe("SupabaseAuth", () => {
  it("User は id・email・displayName だけ（Supabase の内部情報を出さない）", async () => {
    const { auth } = makeEnv();
    const user = await auth.signIn("alice@example.com", "alice-pass");
    expect(user).toEqual({
      id: "u-alice",
      email: "alice@example.com",
      displayName: "Alice",
    });
    expect(await auth.getCurrentUser()).toEqual(user);
  });

  it("display_name が無いユーザーは、メールアドレスを表示名にする", async () => {
    const client = createFakeSupabaseClient({
      users: [{ id: "u-x", email: "x@example.com", password: "x-pass" }],
    });
    const auth = new SupabaseAuth({ client });
    const user = await auth.signIn("x@example.com", "x-pass");
    expect(user.displayName).toBe("x@example.com");
  });

  it("パスワード違いと未登録は、同じメッセージで拒否する", async () => {
    const { auth } = makeEnv();
    const wrong = auth.signIn("alice@example.com", "wrong");
    const nobody = auth.signIn("nobody@example.com", "whatever");
    await expect(wrong).rejects.toThrow(
      "メールアドレスまたはパスワードが違います",
    );
    await expect(nobody).rejects.toThrow(
      "メールアドレスまたはパスワードが違います",
    );
  });

  it("通信エラーなど、認証情報以外の失敗は別のメッセージにする", async () => {
    const { auth } = makeEnv({
      signInError: {
        name: "AuthRetryableFetchError",
        status: 0,
        message: "Failed to fetch",
      },
    });
    await expect(
      auth.signIn("alice@example.com", "alice-pass"),
    ).rejects.toThrow(
      "ログインできませんでした。時間をおいて、もう一度お試しください",
    );
  });

  it("空のメール・パスワードは Supabase に問い合わせずに拒否する", async () => {
    const { auth, client } = makeEnv();
    const spy = vi.spyOn(client.auth, "signInWithPassword");
    await expect(auth.signIn("", "")).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });

  it("signOut の失敗は reject で伝える", async () => {
    const { auth, client } = makeEnv();
    client.auth.signOut = async () => ({
      error: { name: "AuthApiError", message: "boom" },
    });
    await expect(auth.signOut()).rejects.toThrow();
  });

  it("トークン更新でユーザーが変わらないときは、通知しない", async () => {
    const { auth, client } = makeEnv();
    await auth.signIn("alice@example.com", "alice-pass");
    const cb = vi.fn();
    auth.onAuthChange(cb);
    await tick();
    const before = cb.mock.calls.length;
    client.auth.__refresh();
    await tick();
    expect(cb.mock.calls.length).toBe(before);
  });

  it("擬似ユーザー切替（switchUser / listUsers）を持たない", () => {
    const { auth } = makeEnv();
    expect(auth.switchUser).toBeUndefined();
    expect(auth.listUsers).toBeUndefined();
  });
});
