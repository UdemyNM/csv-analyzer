// 対象: tests/repositories/local/LocalAuth.js（テスト用の AuthRepository）
// 本物（SupabaseAuth）と同じ契約を満たすことを確かめ、テストの土台として信頼できるようにする
import { describe, it, expect } from "vitest";
import { LocalAuth } from "./LocalAuth.js";
import { describeAuthRepositoryContract } from "../contract/authRepository.contract.js";
import { USERS } from "../contract/fixtures.js";
import { createLocalEnv } from "./createLocalEnv.js";

describeAuthRepositoryContract("LocalAuth（テスト用）", createLocalEnv);

describe("LocalAuth（テスト用）固有", () => {
  it("インスタンスごとに状態を持つ（別インスタンスのログインは影響しない）", async () => {
    const a = new LocalAuth({ users: USERS });
    const b = new LocalAuth({ users: USERS });
    await a.signIn(USERS[0].email, USERS[0].password);
    expect(await b.getCurrentUser()).toBeNull();
  });

  it("擬似ユーザー切替（switchUser / listUsers）を持たない", () => {
    const auth = new LocalAuth({ users: USERS });
    expect(auth.switchUser).toBeUndefined();
    expect(auth.listUsers).toBeUndefined();
  });
});
