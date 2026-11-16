// 対象: src/repositories/local/LocalAuth.js（擬似ユーザー切替つき AuthRepository）
import { describe, it, expect, vi } from "vitest";
import { LocalAuth } from "../../../src/repositories/local/LocalAuth.js";
import { describeAuthRepositoryContract } from "../contract/authRepository.contract.js";
import { USERS } from "../contract/fixtures.js";
import { createLocalEnv } from "./createLocalEnv.js";

describeAuthRepositoryContract("LocalAuth", createLocalEnv);

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("LocalAuth 固有（擬似ユーザー切替）", () => {
  const make = () => new LocalAuth({ users: USERS });

  it("listUsers が切替用のユーザー一覧を返す（パスワードは含めない）", async () => {
    const list = await make().listUsers();
    expect(list).toHaveLength(USERS.length);
    expect(list.map((u) => u.id).sort()).toEqual(USERS.map((u) => u.id).sort());
    for (const u of list) {
      expect(typeof u.email).toBe("string");
      expect(typeof u.displayName).toBe("string");
      expect(u.password).toBeUndefined();
    }
  });

  it("switchUser でパスワード無しに、そのユーザーへ切り替わる", async () => {
    const auth = make();
    const user = await auth.switchUser("u-bob");
    expect(user.id).toBe("u-bob");
    expect((await auth.getCurrentUser()).id).toBe("u-bob");
  });

  it("switchUser でログイン済みのユーザーを別のユーザーへ切り替えられる", async () => {
    const auth = make();
    await auth.signIn(USERS[0].email, USERS[0].password);
    await auth.switchUser("u-carol");
    expect((await auth.getCurrentUser()).id).toBe("u-carol");
  });

  it("switchUser は onAuthChange に通知する", async () => {
    const auth = make();
    const cb = vi.fn();
    auth.onAuthChange(cb);
    await tick();
    await auth.switchUser("u-bob");
    await tick();
    expect(cb.mock.lastCall[0].id).toBe("u-bob");
  });

  it("存在しないユーザーへの switchUser は拒否され、現在のユーザーは変わらない", async () => {
    const auth = make();
    await auth.switchUser("u-alice");
    await expect(auth.switchUser("u-nobody")).rejects.toThrow();
    expect((await auth.getCurrentUser()).id).toBe("u-alice");
  });

  it("signOut 後は switchUser するまで null のまま", async () => {
    const auth = make();
    await auth.switchUser("u-alice");
    await auth.signOut();
    expect(await auth.getCurrentUser()).toBeNull();
  });

  it("インスタンスごとに状態を持つ（別インスタンスのログインは影響しない）", async () => {
    const a = make();
    const b = make();
    await a.switchUser("u-alice");
    expect(await b.getCurrentUser()).toBeNull();
  });
});
