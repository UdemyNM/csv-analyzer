// 対象: src/App.jsx（default export）。HashRouter を内部に持つ
// 仕様: docs/05 2 章（画面とパス）、docs/03 1・4 章、docs/04 Phase 4・5b、FR-01・02・10・13
// 契約: <App auth={AuthRepository} datasets={DatasetRepository} views={ViewRepository} profiles?={...} createWorker?={...} />
//   - 未ログインは、どのパスでも /login（ログイン画面）へ。ログイン成功で / へ
//   - / は DropZone＋自分と全員公開の一覧。ヘッダー（AppHeader）にログアウト。擬似ユーザー切替は無い（ユーザーは管理者が Supabase で作る）
//   - 作成者名は、自分のものはログイン中のユーザーの表示名。他人のものは profiles.listDisplayNames() の表示名
//     （profiles が無い・取得に失敗した・載っていないときは「不明なユーザー」）
//   - /upload のルートは無い（ヘッダーにもリンクが無い）
//   - /datasets/:id は src/components/datasets/DatasetDetailPage.jsx（default export）を React.lazy で読む。
//     別トラックが作るファイルなので、このテストでは vi.mock で代替する（スタブは id と location.state.justUploaded を表示）
//   - 一覧の取得失敗は role=alert と「再試行」ボタン
//   - createWorker は DropZone へそのまま渡す
// 実行時は window.location.hash でパスを指定する（HashRouter）
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App.jsx";
import { createLocalEnv } from "./repositories/local/createLocalEnv.js";
import { makeFile, createAutoWorker } from "./components/uiListHelpers.js";
import {
  META,
  makeCsvFile,
  utf8Bytes,
  signInAs,
} from "./repositories/contract/fixtures.js";

vi.mock("../src/components/datasets/DatasetDetailPage.jsx", async () => {
  const React = await import("react");
  const { useParams, useLocation } = await import("react-router-dom");
  return {
    default: function DatasetDetailPageStub() {
      const { id } = useParams();
      const location = useLocation();
      return React.createElement(
        "div",
        { "data-testid": "detail-stub" },
        `${id}|${String(location.state?.justUploaded)}`,
      );
    },
  };
});

const seedDataset = (env, name, visibility) =>
  env.datasets.create({
    name,
    visibility,
    file: makeCsvFile(utf8Bytes("店舗,売上\n東京,100\n"), name),
    meta: META,
  });

async function setup({
  signedInAs,
  hash = "#/",
  datasetsOverride,
  profiles,
} = {}) {
  const env = await createLocalEnv();
  for (const key of ["alice", "bob"]) {
    await signInAs(env, key);
    await seedDataset(env, `${key}-private.csv`, "private");
    await seedDataset(env, `${key}-shared.csv`, "shared");
  }
  if (signedInAs) await signInAs(env, signedInAs);
  else await env.auth.signOut();
  window.location.hash = hash;
  const datasets = datasetsOverride ? datasetsOverride(env) : env.datasets;
  render(
    <App
      auth={env.auth}
      datasets={datasets}
      views={env.views}
      profiles={profiles}
      createWorker={createAutoWorker()}
    />,
  );
  return env;
}

const linkNames = () => screen.getAllByRole("link").map((a) => a.textContent);

afterEach(() => {
  window.location.hash = "";
});

describe("App: 未ログイン（FR-02）", () => {
  it("/ を開くとログイン画面へ。一覧もログアウトも見えない", async () => {
    await setup({ hash: "#/" });
    expect(await screen.findByLabelText("メールアドレス")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/login");
    expect(screen.queryByTestId("drop-zone")).toBeNull();
    expect(screen.queryByRole("button", { name: "ログアウト" })).toBeNull();
  });

  it("/datasets/:id を直接開いてもログイン画面へ（詳細は出ない）", async () => {
    await setup({ hash: "#/datasets/alice-secret" });
    expect(await screen.findByLabelText("メールアドレス")).toBeInTheDocument();
    expect(screen.queryByTestId("detail-stub")).toBeNull();
  });
});

describe("App: ログイン・ログアウト（FR-01）", () => {
  it("正しいメール・パスワードでログインすると / の一覧画面になる", async () => {
    const user = userEvent.setup();
    await setup({ hash: "#/login" });
    await user.type(
      await screen.findByLabelText("メールアドレス"),
      "alice@example.com",
    );
    await user.type(screen.getByLabelText("パスワード"), "alice-pass");
    await user.click(screen.getByRole("button", { name: "ログイン" }));
    expect(
      await screen.findByRole("button", { name: "ファイルを選ぶ" }),
    ).toBeInTheDocument();
    expect(window.location.hash).toBe("#/");
    expect(screen.queryByLabelText("メールアドレス")).toBeNull();
  });

  it("パスワードが違うと、理由を出して /login のまま", async () => {
    const user = userEvent.setup();
    await setup({ hash: "#/login" });
    await user.type(
      await screen.findByLabelText("メールアドレス"),
      "alice@example.com",
    );
    await user.type(screen.getByLabelText("パスワード"), "wrong");
    await user.click(screen.getByRole("button", { name: "ログイン" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "メールアドレスまたはパスワードが違います",
    );
    expect(window.location.hash).toBe("#/login");
  });

  it("ログアウトするとログイン画面へ戻る", async () => {
    const user = userEvent.setup();
    await setup({ signedInAs: "alice" });
    await user.click(await screen.findByRole("button", { name: "ログアウト" }));
    expect(await screen.findByLabelText("メールアドレス")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/login");
  });
});

describe("App: 一覧＋ドロップ枠（/）", () => {
  it("ドロップ枠と、自分のもの＋他人の公開だけの一覧を出す（他人の非公開は出さない）", async () => {
    await setup({ signedInAs: "alice" });
    expect(await screen.findByTestId("drop-zone")).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "alice-private.csv" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "alice-shared.csv" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "bob-shared.csv" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "bob-private.csv" })).toBeNull();
  });

  it("一覧に公開範囲バッジと作成者名が出る", async () => {
    await setup({ signedInAs: "alice" });
    const item = (
      await screen.findByRole("link", { name: "bob-shared.csv" })
    ).closest("li");
    expect(within(item).getByText("公開")).toBeInTheDocument();
    expect(within(item).getByText(/不明なユーザー/)).toBeInTheDocument();
    const own = screen
      .getByRole("link", { name: "alice-private.csv" })
      .closest("li");
    expect(within(own).getByText("非公開")).toBeInTheDocument();
    expect(within(own).getByText(/Alice/)).toBeInTheDocument();
  });

  it("profiles があれば、他人のものにも作成者の表示名が出る", async () => {
    const profiles = {
      listDisplayNames: vi.fn(async () => ({ "u-bob": "ボブ" })),
    };
    await setup({ signedInAs: "alice", profiles });
    const item = (
      await screen.findByRole("link", { name: "bob-shared.csv" })
    ).closest("li");
    expect(await within(item).findByText(/ボブ/)).toBeInTheDocument();
    // 自分の表示名は、ログイン中のユーザーのものを使う
    const own = screen
      .getByRole("link", { name: "alice-private.csv" })
      .closest("li");
    expect(within(own).getByText(/Alice/)).toBeInTheDocument();
  });

  it("profiles の取得に失敗しても、一覧は出て他人は「不明なユーザー」", async () => {
    const profiles = {
      listDisplayNames: vi.fn(async () => {
        throw new Error("network");
      }),
    };
    await setup({ signedInAs: "alice", profiles });
    const item = (
      await screen.findByRole("link", { name: "bob-shared.csv" })
    ).closest("li");
    expect(within(item).getByText(/不明なユーザー/)).toBeInTheDocument();
    expect(profiles.listDisplayNames).toHaveBeenCalled();
  });

  it("ヘッダーにアップロードへのリンクが無い（/upload は廃止）", async () => {
    await setup({ signedInAs: "alice" });
    await screen.findByRole("link", { name: "alice-private.csv" });
    expect(screen.queryByRole("link", { name: /アップロード/ })).toBeNull();
    expect(document.querySelector('a[href*="upload"]')).toBeNull();
    expect(linkNames()).toContain("データ一覧");
  });

  it("ヘッダーに擬似ユーザー切替が無い", async () => {
    await setup({ signedInAs: "alice" });
    await screen.findByRole("link", { name: "alice-private.csv" });
    expect(screen.queryByRole("combobox", { name: /ユーザー/ })).toBeNull();
    expect(screen.queryByText("ユーザー切替")).toBeNull();
  });

  it("一覧の取得に失敗したら、alert と「再試行」を出し、再試行で一覧が出る", async () => {
    const user = userEvent.setup();
    const list = vi.fn();
    await setup({
      signedInAs: "alice",
      datasetsOverride: (env) => {
        list
          .mockRejectedValueOnce(new Error("通信エラー"))
          .mockImplementation(() => env.datasets.list());
        return {
          list,
          get: (...a) => env.datasets.get(...a),
          create: (...a) => env.datasets.create(...a),
          update: (...a) => env.datasets.update(...a),
          remove: (...a) => env.datasets.remove(...a),
          downloadCsv: (...a) => env.datasets.downloadCsv(...a),
        };
      },
    });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /再試行/ }));
    expect(
      await screen.findByRole("link", { name: "alice-private.csv" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("App: アップロード → 分析画面（FR-10）", () => {
  it("ドロップ枠にCSVを選ぶと、非公開で保存して /datasets/:id を開く（justUploaded つき）", async () => {
    const env = await setup({ signedInAs: "alice" });
    const zone = await screen.findByTestId("drop-zone");
    const input = zone.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [makeFile("upload.csv")] } });

    const stub = await screen.findByTestId("detail-stub");
    const mine = (await env.datasets.list()).find(
      (d) => d.name === "upload.csv",
    );
    expect(mine).toBeDefined();
    expect(mine.visibility).toBe("private");
    expect(mine.ownerId).toBe("u-alice");
    expect(mine.meta).toEqual(
      expect.objectContaining({ rowCount: 2, encoding: "utf-8" }),
    );
    expect(stub).toHaveTextContent(`${mine.id}|true`);
    expect(window.location.hash).toBe(`#/datasets/${mine.id}`);
  });

  it("一覧のリンクから詳細へ移るときは justUploaded を付けない", async () => {
    const user = userEvent.setup();
    await setup({ signedInAs: "alice" });
    await user.click(
      await screen.findByRole("link", { name: "bob-shared.csv" }),
    );
    const stub = await screen.findByTestId("detail-stub");
    expect(stub).toHaveTextContent(/\|undefined$/);
  });
});

describe("App: 詳細画面のルート", () => {
  it("ログイン済みで /datasets/:id を開くと、詳細ページ（lazy）を表示する", async () => {
    await setup({ signedInAs: "alice", hash: "#/datasets/abc" });
    expect(await screen.findByTestId("detail-stub")).toHaveTextContent(
      "abc|undefined",
    );
  });
});
