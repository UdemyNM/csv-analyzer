/**
 * Supabase のクライアントを作る（公式: createClient(url, publishableKey, options)）。
 * ブラウザに置いてよいのは publishable キー（従来の anon キー）だけ。秘密のキーは拒否する。
 */
import { createClient } from "@supabase/supabase-js";

/** 接続設定が無い・不正。 */
export class SupabaseConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

const isLocalHost = (host) => host === "127.0.0.1" || host === "localhost";

function assertUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new SupabaseConfigError("Supabase の URL がありません");
  }
  const ok =
    parsed.protocol === "https:" ||
    (parsed.protocol === "http:" && isLocalHost(parsed.hostname));
  if (!ok) {
    throw new SupabaseConfigError("Supabase の URL は https にしてください");
  }
}

/** JWT（従来のキー）の role を読む。JWT でなければ null。署名は検証しない（拒否の判定だけに使う）。 */
function jwtRole(key) {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json)?.role ?? null;
  } catch {
    return null;
  }
}

function assertPublicKey(key) {
  if (typeof key !== "string" || key === "") {
    throw new SupabaseConfigError("Supabase のキーがありません");
  }
  if (key.startsWith("sb_secret_") || jwtRole(key) === "service_role") {
    throw new SupabaseConfigError(
      "秘密のキーが設定されています。publishable キー（anon キー）を使ってください",
    );
  }
}

/** @param {{url?: string, key?: string}} config */
export function createSupabaseClient({ url, key }) {
  assertUrl(url);
  assertPublicKey(key);
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // メール＋パスワードだけなので、URL からのログイン検出は使わない（HashRouter の # とも混ざらない）
      detectSessionInUrl: false,
    },
  });
}
