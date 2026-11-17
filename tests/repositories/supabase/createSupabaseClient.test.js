// 対象: src/repositories/supabase/createSupabaseClient.js
// 契約:
//   createSupabaseClient({ url, key }) → createClient(url, key, options) の戻り値
//   - url・key が無ければ SupabaseConfigError（name で見分けられる）
//   - 秘密のキー（sb_secret_… / role が service_role の JWT）は、ブラウザに置いてはいけないので拒否する
//   - メール＋パスワードだけなので、URL からのログイン検出（detectSessionInUrl）は切る
import { describe, it, expect, vi, beforeEach } from "vitest";

const createClient = vi.fn(() => ({ auth: {} }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const { createSupabaseClient, SupabaseConfigError } =
  await import("../../../src/repositories/supabase/createSupabaseClient.js");

const URL = "https://abcdefgh.supabase.co";
const PUBLISHABLE = "sb_publishable_xxxxxxxxxxxxxxxx";

// header.payload.signature の形の JWT（署名は検証しないので適当でよい）
const jwt = (payload) =>
  ["e30", btoa(JSON.stringify(payload)).replace(/=+$/, ""), "sig"].join(".");

beforeEach(() => createClient.mockClear());

describe("createSupabaseClient", () => {
  it("URL と publishable キーでクライアントを作る", () => {
    const client = createSupabaseClient({ url: URL, key: PUBLISHABLE });
    expect(client).toEqual({ auth: {} });
    expect(createClient).toHaveBeenCalledWith(URL, PUBLISHABLE, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  });

  it("従来の anon キー（role が anon の JWT）も使える", () => {
    const key = jwt({ role: "anon" });
    createSupabaseClient({ url: URL, key });
    expect(createClient).toHaveBeenCalledWith(URL, key, expect.any(Object));
  });

  it.each([
    ["URL が無い", { url: "", key: PUBLISHABLE }],
    ["キーが無い", { url: URL, key: undefined }],
    [
      "URL が https でない",
      { url: "http://abcdefgh.supabase.co", key: PUBLISHABLE },
    ],
  ])("%s ときは SupabaseConfigError", (_, input) => {
    expect(() => createSupabaseClient(input)).toThrow(SupabaseConfigError);
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    ["sb_secret_ のキー", "sb_secret_xxxxxxxxxxxxxxxx"],
    ["role が service_role の JWT", jwt({ role: "service_role" })],
  ])("%s は拒否する（ブラウザに置いてはいけない）", (_, key) => {
    expect(() => createSupabaseClient({ url: URL, key })).toThrow(
      SupabaseConfigError,
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("開発用のローカル Supabase（http://127.0.0.1 / localhost）は http でもよい", () => {
    createSupabaseClient({ url: "http://127.0.0.1:54321", key: PUBLISHABLE });
    createSupabaseClient({ url: "http://localhost:54321", key: PUBLISHABLE });
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("SupabaseConfigError は name で見分けられる", () => {
    const e = new SupabaseConfigError("x");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("SupabaseConfigError");
  });
});
