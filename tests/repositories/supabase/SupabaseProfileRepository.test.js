// 対象: src/repositories/supabase/SupabaseProfileRepository.js（作成者名の引き当て）
// 仕様: docs/02 3 章（profiles。ログイン中のユーザーは全員の表示名を読める）
// 契約:
//   new SupabaseProfileRepository({ client })
//   listDisplayNames() → { [userId]: 表示名 }。未ログインは {}（エラーにしない）
//   表示名（app_metadata.display_name）が無い人は含めない（メールアドレスを他人に見せない。画面は「不明なユーザー」）
import { describe, it, expect } from "vitest";
import { USERS, signInAs } from "../contract/fixtures.js";
import { createSupabaseEnv } from "./createSupabaseEnv.js";

describe("SupabaseProfileRepository", () => {
  it("ログイン中なら、全員の表示名を { id: 表示名 } で返す", async () => {
    const env = await createSupabaseEnv();
    await signInAs(env, "bob");
    expect(await env.profiles.listDisplayNames()).toEqual({
      "u-alice": "Alice",
      "u-bob": "Bob",
      "u-carol": "Carol",
    });
  });

  it("表示名が無い人は含めず、メールアドレスも返さない", async () => {
    const env = await createSupabaseEnv({
      users: [
        ...USERS,
        { id: "u-dave", email: "dave@example.com", password: "dave-pass" },
      ],
    });
    await signInAs(env, "bob");
    const names = await env.profiles.listDisplayNames();
    expect(names).not.toHaveProperty("u-dave");
    expect(Object.values(names)).not.toContain("dave@example.com");
    expect(names["u-alice"]).toBe("Alice");
  });

  it("未ログインなら空のオブジェクト", async () => {
    const env = await createSupabaseEnv();
    expect(await env.profiles.listDisplayNames()).toEqual({});
  });
});
