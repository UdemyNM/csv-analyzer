// 対象: src/main.jsx（エントリーポイント）
// 仕様: CLAUDE.md フォルダ構成（main.jsx）、docs/01 FR-01（ユーザーは管理者が Supabase で作る）、docs/05 7 章（共通CSS src/styles.css）
// 契約:
//   - 環境変数 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY から Supabase のクライアントを作り、
//     #root に <App auth datasets views profiles /> を描画する（App は本テストでは vi.mock で代替）
//   - auth は SupabaseAuth。擬似ユーザー切替（switchUser / listUsers）は無い
//   - datasets / views / profiles も Supabase 実装（Phase 8b。IndexedDB は使わない）
//   - 環境変数が無い・不正なら、App を出さずに設定エラーを role=alert で出す（擬似ユーザーへ逃がさない）
//   - src/styles.css を import する
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createFakeSupabaseClient } from "./repositories/supabase/fakeSupabaseClient.js";

vi.mock("../src/App.jsx", async () => {
  const React = await import("react");
  return {
    default: function AppStub(props) {
      globalThis.__appProps = props;
      return React.createElement("div", { "data-testid": "app-stub" }, "app");
    },
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => createFakeSupabaseClient({ users: [] })),
}));

const source = () =>
  readFileSync(resolve(process.cwd(), "src/main.jsx"), "utf8");

beforeEach(() => {
  vi.resetModules();
  globalThis.__appProps = undefined;
  document.body.innerHTML = '<div id="root"></div>';
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("main.jsx", () => {
  it("Supabase の設定があれば、Supabase の auth / datasets / views / profiles で App を描画する", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://abcdefgh.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    await import("../src/main.jsx");
    expect(await screen.findByTestId("app-stub")).toBeInTheDocument();

    const { SupabaseAuth } =
      await import("../src/repositories/supabase/SupabaseAuth.js");
    const { SupabaseDatasetRepository } =
      await import("../src/repositories/supabase/SupabaseDatasetRepository.js");
    const { SupabaseViewRepository } =
      await import("../src/repositories/supabase/SupabaseViewRepository.js");
    const { SupabaseProfileRepository } =
      await import("../src/repositories/supabase/SupabaseProfileRepository.js");
    const props = globalThis.__appProps;
    expect(props.auth).toBeInstanceOf(SupabaseAuth);
    expect(props.auth.switchUser).toBeUndefined();
    expect(props.auth.listUsers).toBeUndefined();
    expect(props.datasets).toBeInstanceOf(SupabaseDatasetRepository);
    expect(props.views).toBeInstanceOf(SupabaseViewRepository);
    expect(props.profiles).toBeInstanceOf(SupabaseProfileRepository);
  });

  it("IndexedDB の実装を読み込まない", () => {
    expect(source()).not.toMatch(/repositories\/local|IndexedDB|indexedDB/);
  });

  it("Supabase の設定が無ければ、App を出さずに設定エラーを出す", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    await import("../src/main.jsx");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Supabase の接続設定/,
    );
    expect(screen.queryByTestId("app-stub")).toBeNull();
    expect(globalThis.__appProps).toBeUndefined();
  });

  it("秘密のキーが設定されていたら、App を出さずに設定エラーを出す", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://abcdefgh.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_secret_oops");
    await import("../src/main.jsx");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("app-stub")).toBeNull();
  });

  it("デモユーザー（メール・パスワード）をソースに持たない", () => {
    expect(source()).not.toMatch(/DEMO_USERS|password|LocalAuth/);
  });

  it("共通 CSS（src/styles.css）を import している", () => {
    // jsdom 環境では import.meta.url が file: にならないため、プロジェクト直下から引く
    expect(source()).toMatch(/import\s+['"]\.\/styles\.css['"]/);
  });
});
