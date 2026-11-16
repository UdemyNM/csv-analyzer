// 対象: src/components/datasets/DatasetDetailPage.jsx（無駄な再計算をしないこと。結果は変えない）
// 背景（計測。本番ビルド・Chromium・10MB・244,806 行）:
//   - 並べ替えは 0.5〜0.7 秒かかり、そのうち基本統計・相関の再計算が約 0.4 秒。
//     統計・相関は行の「並び」に依存しない（件数・平均・中央値・標準偏差・最小・最大・相関はどれも順序に無関係）ので、
//     並べ替えだけが変わったときは計算し直さない（フィルタが変われば、行の集合が変わるので計算し直す）。
//   - 条件の追加は、検証のために filterRows を 1 回、表示のために同じ引数でもう 1 回、計 2 回計算していた
//     （3 条件で 0.53 秒のうち約半分）。同じ結果を使い回し、1 回にする。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatasetDetailPage } from "../../../src/components/datasets/DatasetDetailPage.jsx";
import {
  createLocalEnv,
  renderDetailPage,
  seedDataset,
  signInAs,
} from "../uiAnalysisHelpers.jsx";
import { statistics } from "../../../src/utils/statistics.js";
import { correlation } from "../../../src/utils/correlation.js";
import { filterRows } from "../../../src/utils/filterRows.js";

vi.mock("recharts", async (orig) =>
  (await import("../uiAnalysisHelpers.jsx")).withSizedContainer(await orig()),
);
vi.mock("../../../src/utils/statistics.js", async (orig) => {
  const actual = await orig();
  return { ...actual, statistics: vi.fn(actual.statistics) };
});
vi.mock("../../../src/utils/correlation.js", async (orig) => {
  const actual = await orig();
  return { ...actual, correlation: vi.fn(actual.correlation) };
});
vi.mock("../../../src/utils/filterRows.js", async (orig) => {
  const actual = await orig();
  return { ...actual, filterRows: vi.fn(actual.filterRows) };
});
vi.setConfig({ testTimeout: 30000 });

const WAIT = { timeout: 10000 };

let env;
beforeEach(async () => {
  env = await createLocalEnv();
});
afterEach(() => {
  vi.clearAllMocks();
});

async function open() {
  const created = await seedDataset(env);
  const me = await signInAs(env, "alice");
  renderDetailPage(DatasetDetailPage, {
    env,
    datasetId: created.id,
    currentUser: me,
  });
  await screen.findByRole("heading", { name: created.name }, WAIT);
  return userEvent.setup();
}

const firstDataRow = () => {
  const region = screen.getByRole("region", { name: "データ表の内容" });
  return within(region)
    .getAllByRole("row")
    .find((r) => within(r).queryAllByRole("columnheader").length === 0);
};

describe("DatasetDetailPage: 無駄な再計算をしない", () => {
  it("並べ替えだけを変えても、基本統計・相関は計算し直さない（表の並びは変わる）", async () => {
    const user = await open();
    const statsCalls = statistics.mock.calls.length;
    const correlationCalls = correlation.mock.calls.length;
    expect(statsCalls).toBeGreaterThan(0);
    expect(firstDataRow()).toHaveTextContent("東京");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "並べ替え" }),
      "売上",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "並べ替えの向き" }),
      "desc",
    );

    expect(firstDataRow()).toHaveTextContent(/大阪.*2,?000/); // 売上の降順で先頭が変わった
    expect(statistics.mock.calls.length).toBe(statsCalls);
    expect(correlation.mock.calls.length).toBe(correlationCalls);
  });

  it("フィルタを変えたら、基本統計・相関は計算し直す（行の集合が変わるため）", async () => {
    const user = await open();
    const statsCalls = statistics.mock.calls.length;

    await user.click(screen.getByRole("button", { name: /条件を追加/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "列" }),
      "店舗",
    );
    await user.type(screen.getByRole("textbox", { name: "値" }), "東京");
    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(statistics.mock.calls.length).toBeGreaterThan(statsCalls);
    const stats = screen.getByRole("region", { name: "基本統計の表" });
    // 東京は 2 行（数量 10・5 → 件数 2）。全体は 5 行なので、計算し直した結果が出ている
    const row = within(stats).getByRole("row", { name: /数量/ });
    expect(within(row).getAllByRole("cell")[0]).toHaveTextContent(/^2$/);
  });

  it("条件を追加したとき、その条件での絞り込みは 1 回だけ計算する（検証と表示で 2 回計算しない）", async () => {
    const user = await open();
    filterRows.mockClear();

    await user.click(screen.getByRole("button", { name: /条件を追加/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "列" }),
      "店舗",
    );
    await user.type(screen.getByRole("textbox", { name: "値" }), "東京");
    await user.click(screen.getByRole("button", { name: "追加" }));

    const withNewFilter = filterRows.mock.calls.filter(
      ([, filters]) => filters.length === 1,
    );
    expect(withNewFilter).toHaveLength(1);
    expect(
      screen.getByRole("list", { name: "絞り込み条件" }),
    ).toHaveTextContent("店舗 = 東京");
  });

  it("不正な条件は、従来どおり追加されず理由が alert に出る", async () => {
    const user = await open();

    await user.click(screen.getByRole("button", { name: /条件を追加/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "列" }),
      "売上",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "演算子" }),
      "gt",
    );
    await user.type(screen.getByRole("textbox", { name: "値" }), "abc");
    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /条件を追加できません/,
    );
    expect(
      screen.queryByRole("list", { name: "絞り込み条件" }),
    ).toBeEmptyDOMElement();
  });
});
