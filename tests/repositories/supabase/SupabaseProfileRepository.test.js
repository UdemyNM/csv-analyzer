// 対象: src/repositories/supabase/SupabaseProfileRepository.js（作成者名の引き当て）
// 仕様: docs/02 3 章（profiles。ログイン中のユーザーは全員の表示名を読める）
// 契約:
//   new SupabaseProfileRepository({ client })
//   listDisplayNames() → { [userId]: 表示名 }。未ログインは {}（エラーにしない）
import { describe, it, expect } from "vitest";
import { signInAs } from "../contract/fixtures.js";
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

  it("未ログインなら空のオブジェクト", async () => {
    const env = await createSupabaseEnv();
    expect(await env.profiles.listDisplayNames()).toEqual({});
  });
});
