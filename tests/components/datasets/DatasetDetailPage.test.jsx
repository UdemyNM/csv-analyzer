// 対象: src/components/datasets/DatasetDetailPage.jsx（名前付き export { DatasetDetailPage }）
// 仕様: docs/03 1・5・7 章、docs/04 Phase 5・5b・6、docs/05 2〜9 章（詳細画面 /datasets/:id、案B）
// 契約（細部は本テストで固定）:
//   <DatasetDetailPage datasetRepository viewRepository currentUser ownerNames createWorker onDatasetsChanged />
//   - ルートの :id（react-router の useParams）を使う。HashRouter / MemoryRouter の内側に置かれる
//   - datasetRepository / viewRepository は repositories/types.js の契約どおり。currentUser = {id,email,displayName}
//   - ownerNames = {[ownerId]: 表示名}（作成者の表示に使う）。createWorker は useCsvAnalysis にそのまま渡す
//   - onDatasetsChanged(): 公開範囲・名前の変更・削除に成功したとき、一覧の状態を取り直すために呼ぶ
//   - 読込: get(id) → downloadCsv(id) → Worker でパース。get が NotFoundError なら heading「見つかりません」。
//     通信・パースの失敗は role="alert" と button「再試行」（押すと最初からやり直す）
//   - 概要は DatasetHeader（作成者本人にだけ切替・名前変更・削除）。削除は window.confirm で確認し、成功したら "/" へ移動
//   - 本体は CollapsibleSection を縦に 4 つ: データ表 → グラフ → 集計 → 統計・相関（初期は全部開く）
//   - フィルタバーはセクションの外。条件・並べ替え・集計・グラフの設定は画面が持ち、views.config と同じ形
//       { filters, sort, aggregation, chart }（無い値は filters=[]、sort / aggregation / chart は null）
//   - 全セクション（データ表・グラフ・集計・統計・相関）は「フィルタ → 並べ替え」後の行を使う。
//     集計があるときグラフの元データは集計結果（X軸=groupBy の列＋指標の出力名、Y軸=指標の出力名）
//   - 画面から追加した条件が InvalidFilterError になるときは、追加せず role="alert" に理由を出す。
//     ビュー由来で不正な条件があるときは、絞り込まず全件を出し、role="alert" に理由を出す
//   - ビュー: 「ビューを保存」→ SaveViewDialog → viewRepository.create（保存する config のグラフの軸は「今の元データにある列」に絞る）。
//     保存すると、そのビューが選択された状態になる。選択すると設定を読み込む。読込時に存在しない列の条件は無効化し、「無効」を含む警告を出す。
//     編集・削除は自分のビューだけ（「ビューを編集」は名前と今の設定で update、「ビューを削除」は confirm のあと remove）
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DatasetDetailPage } from "../../../src/components/datasets/DatasetDetailPage.jsx";
import {
  createInlineWorkerFactory,
  createLocalEnv,
  renderDetailPage,
  seedDataset,
  signInAs,
  wrapRepository,
} from "../uiAnalysisHelpers.jsx";

vi.mock("recharts", async (orig) =>
  (await import("../uiAnalysisHelpers.jsx")).withSizedContainer(await orig()),
);
vi.setConfig({ testTimeout: 30000 });

const WAIT = { timeout: 10000 };
const SECTIONS = ["データ表", "グラフ", "集計", "統計・相関"];

let env;
let confirmSpy;

beforeEach(async () => {
  env = await createLocalEnv();
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Alice としてデータセットを作り、Alice の詳細画面を描いて、読み込み完了まで待つ */
async function openAs(who = "alice", { dataset, ...options } = {}) {
  const created = dataset ?? (await seedDataset(env));
  const me = await signInAs(env, who);
  const utils = renderDetailPage(DatasetDetailPage, {
    env,
    datasetId: created.id,
    currentUser: me,
    ...options,
  });
  await screen.findByRole("heading", { name: created.name }, WAIT);
  return { created, me, user: userEvent.setup(), ...utils };
}

const section = (name) => screen.getByRole("region", { name });
const toggleOf = (name) =>
  document.querySelector(`[aria-controls="${section(name).id}"]`);
const tableRows = (scope) =>
  within(scope)
    .getAllByRole("row")
    .filter((r) => within(r).queryAllByRole("columnheader").length === 0);
const dataRows = () =>
  tableRows(screen.getByRole("region", { name: "データ表の内容" }));
const chipList = () => screen.queryByRole("list", { name: "絞り込み条件" });

async function addFilter(user, column, op, value) {
  await user.click(screen.getByRole("button", { name: /条件を追加/ }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "列" }),
    column,
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "演算子" }),
    op,
  );
  await user.type(screen.getByRole("textbox", { name: "値" }), value);
  await user.click(screen.getByRole("button", { name: "追加" }));
}

async function setAggregation(user, { groupBy, metric }) {
  const box = section("集計");
  for (const name of groupBy) {
    await user.click(
      within(within(box).getByRole("group", { name: "グループ化" })).getByRole(
        "checkbox",
        { name },
      ),
    );
  }
  if (metric) {
    await user.selectOptions(
      within(box).getByRole("combobox", { name: "指標の列" }),
      metric.column,
    );
    await user.selectOptions(
      within(box).getByRole("combobox", { name: "集計関数" }),
      metric.fn,
    );
    await user.click(within(box).getByRole("button", { name: "指標を追加" }));
  }
}

async function saveViewAs(user, name) {
  await user.click(screen.getByRole("button", { name: "ビューを保存" }));
  const dialog = screen.getByRole("dialog");
  await user.type(
    within(dialog).getByRole("textbox", { name: "ビュー名" }),
    name,
  );
  await user.click(within(dialog).getByRole("button", { name: "保存" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

const viewsOf = async (datasetId) => env.views.listByDataset(datasetId);

describe("DatasetDetailPage: 読込と概要", () => {
  it("読み込んで、データセット名・公開範囲・行数×列数・文字コード・作成者を出す", async () => {
    await openAs();
    expect(screen.getByText("非公開")).toBeInTheDocument();
    expect(document.body).toHaveTextContent(/5\s*行/);
    expect(document.body).toHaveTextContent(/5\s*列/);
    expect(document.body).toHaveTextContent(/utf-?8/i);
    expect(document.body).toHaveTextContent("Alice");
  });

  it("見えない（他人の private）・無い id は heading「見つかりません」", async () => {
    const created = await seedDataset(env); // Alice の private
    const bob = await signInAs(env, "bob");
    renderDetailPage(DatasetDetailPage, {
      env,
      datasetId: created.id,
      currentUser: bob,
    });
    expect(
      await screen.findByRole("heading", { name: "見つかりません" }, WAIT),
    ).toBeInTheDocument();
    expect(screen.queryByText("sales.csv")).toBeNull();
  });

  it("存在しない id も「見つかりません」", async () => {
    const alice = await signInAs(env, "alice");
    renderDetailPage(DatasetDetailPage, {
      env,
      datasetId: "no-such-id",
      currentUser: alice,
    });
    expect(
      await screen.findByRole("heading", { name: "見つかりません" }, WAIT),
    ).toBeInTheDocument();
  });

  it("原本の取得に失敗したら alert と「再試行」。押すと読み直して表示する", async () => {
    const created = await seedDataset(env);
    const me = await signInAs(env, "alice");
    const downloadCsv = vi
      .fn()
      .mockRejectedValueOnce(new Error("通信エラー"))
      .mockImplementation((id) => env.datasets.downloadCsv(id));
    renderDetailPage(DatasetDetailPage, {
      env,
      datasetId: created.id,
      currentUser: me,
      datasetRepository: wrapRepository(env.datasets, { downloadCsv }),
    });
    expect(await screen.findByRole("alert", {}, WAIT)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "再試行" }));
    expect(
      await screen.findByRole("heading", { name: "sales.csv" }, WAIT),
    ).toBeInTheDocument();
    expect(downloadCsv).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull(), WAIT);
  });

  it("パースに失敗したら alert と「再試行」。押すと読み直して表示する", async () => {
    const created = await seedDataset(env);
    const me = await signInAs(env, "alice");
    renderDetailPage(DatasetDetailPage, {
      env,
      datasetId: created.id,
      currentUser: me,
      createWorker: createInlineWorkerFactory({ failFirst: true }),
    });
    expect(await screen.findByRole("alert", {}, WAIT)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "再試行" }));
    expect(
      await screen.findByRole("heading", { name: "sales.csv" }, WAIT),
    ).toBeInTheDocument();
    expect(
      (await screen.findAllByText("りんご", {}, WAIT)).length,
    ).toBeGreaterThan(0);
  });
});

describe("DatasetDetailPage: セクション", () => {
  it("縦 1 列に データ表 → グラフ → 集計 → 統計・相関 の順で 4 つ、初期はすべて開く", async () => {
    await openAs();
    const regions = SECTIONS.map(section);
    for (let i = 0; i < regions.length - 1; i++) {
      expect(
        regions[i].compareDocumentPosition(regions[i + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    for (const name of SECTIONS) {
      expect(toggleOf(name)).toHaveAttribute("aria-expanded", "true");
      expect(section(name)).toBeVisible();
    }
  });

  it("開閉ボタンで 1 つだけ畳める（ほかは開いたまま）", async () => {
    const { user } = await openAs();
    await user.click(toggleOf("グラフ"));
    expect(toggleOf("グラフ")).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("region", { name: "グラフ", hidden: true }),
    ).not.toBeVisible();
    expect(section("データ表")).toBeVisible();
    expect(section("集計")).toBeVisible();
    expect(section("統計・相関")).toBeVisible();
  });

  it("フィルタバーはセクションの外にある", async () => {
    await openAs();
    const bar = screen.getByRole("button", { name: /条件を追加/ });
    for (const name of SECTIONS) {
      expect(section(name).contains(bar)).toBe(false);
    }
  });
});

describe("DatasetDetailPage: データ表と絞り込み・並べ替え", () => {
  it("データ表に全行（5 行）を、CSV の値のまま出す", async () => {
    await openAs();
    expect(dataRows()).toHaveLength(5);
    expect(within(dataRows()[0]).getAllByRole("cell")[0]).toHaveTextContent(
      "東京",
    );
  });

  it("条件を追加するとチップが出て、データ表・統計が絞り込み後の行になる", async () => {
    const { user } = await openAs();
    await addFilter(user, "売上", "gte", "1000");
    const chips = within(chipList()).getAllByRole("listitem");
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveTextContent("売上");
    expect(chips[0]).toHaveTextContent("1000");
    expect(dataRows()).toHaveLength(3); // 1000, 2000, 1500
    expect(screen.queryByText("名古屋")).toBeNull();
    // 統計も絞り込み後（売上の件数 3）
    const stats = section("統計・相関");
    const salesRow = within(within(stats).getAllByRole("table")[0])
      .getAllByRole("row")
      .find((r) => within(r).queryByRole("rowheader", { name: "売上" }));
    expect(within(salesRow).getAllByRole("cell")[0]).toHaveTextContent("3");
  });

  it("チップの × で条件を外すと、全行に戻る", async () => {
    const { user } = await openAs();
    await addFilter(user, "店舗", "eq", "東京");
    expect(dataRows()).toHaveLength(2);
    await user.click(within(chipList()).getByRole("button", { name: /削除/ }));
    expect(dataRows()).toHaveLength(5);
  });

  it("InvalidFilterError になる条件（数値列に「abc」）は、追加せず alert で理由を出す", async () => {
    const { user } = await openAs();
    await addFilter(user, "売上", "gt", "abc");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("abc");
    const list = chipList();
    if (list) expect(within(list).queryAllByRole("listitem")).toHaveLength(0);
    expect(dataRows()).toHaveLength(5);
  });

  it("並べ替えは、データ表に反映される（売上の降順）", async () => {
    const { user } = await openAs();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "並べ替え" }),
      "売上",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "並べ替えの向き" }),
      "desc",
    );
    const first = within(dataRows()[0]).getAllByRole("cell");
    expect(first[0]).toHaveTextContent("大阪");
    expect(first[3]).toHaveTextContent("2000");
    const last = within(dataRows()[4]).getAllByRole("cell");
    expect(last[3]).toHaveTextContent("500");
  });
});

describe("DatasetDetailPage: 集計とグラフ", () => {
  it("集計（店舗ごとの売上合計）の結果が、集計セクションの表に出る", async () => {
    const { user } = await openAs();
    await setAggregation(user, {
      groupBy: ["店舗"],
      metric: { column: "売上", fn: "sum" },
    });
    const result = within(section("集計")).getByRole("region", {
      name: "集計結果",
    });
    const rows = tableRows(result).map((r) =>
      within(r)
        .getAllByRole("cell")
        .map((c) => c.textContent.replace(/,/g, "")),
    );
    expect(rows).toEqual([
      ["東京", "1500"],
      ["大阪", "3500"],
      ["名古屋", "800"],
    ]);
  });

  it("集計は絞り込み後の行に対して行う", async () => {
    const { user } = await openAs();
    await addFilter(user, "商品", "eq", "りんご");
    await setAggregation(user, {
      groupBy: ["店舗"],
      metric: { column: "売上", fn: "sum" },
    });
    const result = within(section("集計")).getByRole("region", {
      name: "集計結果",
    });
    const rows = tableRows(result).map((r) =>
      within(r)
        .getAllByRole("cell")
        .map((c) => c.textContent.replace(/,/g, "")),
    );
    expect(rows).toEqual([
      ["東京", "1000"],
      ["大阪", "2000"],
      ["名古屋", "800"],
    ]);
  });

  it("集計があるとき、グラフの軸は集計結果の列（X: groupBy と出力名、Y: 出力名）になる", async () => {
    const { user } = await openAs();
    await setAggregation(user, {
      groupBy: ["店舗"],
      metric: { column: "売上", fn: "sum" },
    });
    const graph = section("グラフ");
    const xs = within(within(graph).getByRole("combobox", { name: "X軸" }))
      .getAllByRole("option")
      .map((o) => o.value);
    const ys = within(within(graph).getByRole("combobox", { name: "Y軸" }))
      .getAllByRole("option")
      .map((o) => o.value);
    expect(xs).toEqual(expect.arrayContaining(["店舗", "売上_sum"]));
    expect(xs).not.toContain("商品");
    expect(ys).toContain("売上_sum");
    expect(ys).not.toContain("売上");
    expect(ys).not.toContain("店舗");
  });

  it("集計結果でグラフを描ける（role=img）。集計の指標を外して軸が消えたら描かない", async () => {
    const { user } = await openAs();
    await setAggregation(user, {
      groupBy: ["店舗"],
      metric: { column: "売上", fn: "sum" },
    });
    const graph = section("グラフ");
    await user.selectOptions(
      within(graph).getByRole("combobox", { name: "X軸" }),
      "店舗",
    );
    await user.selectOptions(
      within(graph).getByRole("combobox", { name: "Y軸" }),
      "売上_sum",
    );
    const img = await within(graph).findByRole("img", {}, WAIT);
    expect(img.getAttribute("aria-label")).toContain("売上_sum");

    await user.click(
      within(
        within(section("集計")).getByRole("list", { name: "指標" }),
      ).getByRole("button", { name: /削除/ }),
    );
    await waitFor(() =>
      expect(within(section("グラフ")).queryByRole("img")).toBeNull(),
    );
  });

  it("集計がないとき、グラフの軸は元の列（X は全列、Y は数値列）になり、描ける", async () => {
    const { user } = await openAs();
    const graph = section("グラフ");
    const xs = within(within(graph).getByRole("combobox", { name: "X軸" }))
      .getAllByRole("option")
      .map((o) => o.value);
    const ys = within(within(graph).getByRole("combobox", { name: "Y軸" }))
      .getAllByRole("option")
      .map((o) => o.value);
    expect(xs).toEqual(expect.arrayContaining(["店舗", "売上"]));
    expect(ys).toEqual(expect.arrayContaining(["数量", "売上"]));
    expect(ys).not.toContain("店舗");

    await user.selectOptions(
      within(graph).getByRole("combobox", { name: "X軸" }),
      "店舗",
    );
    await user.selectOptions(
      within(graph).getByRole("combobox", { name: "Y軸" }),
      "売上",
    );
    expect(await within(graph).findByRole("img", {}, WAIT)).toBeInTheDocument();
  });
});

describe("DatasetDetailPage: 統計・相関と「？」", () => {
  it("統計は数値列（数量・売上）、相関行列も数値列だけ", async () => {
    await openAs();
    const stats = section("統計・相関");
    const tables = within(stats).getAllByRole("table");
    expect(tables).toHaveLength(2);
    for (const name of ["数量", "売上"]) {
      expect(
        within(tables[0]).getByRole("rowheader", { name }),
      ).toBeInTheDocument();
      expect(
        within(tables[1]).getByRole("rowheader", { name }),
      ).toBeInTheDocument();
    }
    expect(
      within(tables[0]).queryByRole("rowheader", { name: "店舗" }),
    ).toBeNull();
    expect(
      within(tables[1]).queryByRole("rowheader", { name: "日付" }),
    ).toBeNull();
  });

  it("「？」の解説は、基本統計と相関行列をまたいでも同時に 1 つだけ", async () => {
    const { user } = await openAs();
    await user.click(screen.getByRole("button", { name: "『件数』とは" }));
    expect(screen.getAllByRole("note")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "『相関』とは" }));
    const notes = screen.getAllByRole("note");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveTextContent("一緒に増減する強さ");
  });
});

describe("DatasetDetailPage: 作成者の操作（公開範囲・名前・削除）", () => {
  it("「公開にする」で shared に更新し、ボタンが「非公開にする」に変わり、一覧の取り直しを依頼する", async () => {
    const { user, created, onDatasetsChanged } = await openAs();
    await user.click(screen.getByRole("button", { name: "公開にする" }));
    expect(
      await screen.findByRole("button", { name: "非公開にする" }, WAIT),
    ).toBeInTheDocument();
    expect(screen.getByText("公開")).toBeInTheDocument();
    expect((await env.datasets.get(created.id)).visibility).toBe("shared");
    expect(onDatasetsChanged).toHaveBeenCalled();
  });

  it("名前の変更: 保存で update され、見出しが変わり、一覧の取り直しを依頼する", async () => {
    const { user, created, onDatasetsChanged } = await openAs();
    await user.click(screen.getByRole("button", { name: "名前を変更" }));
    const input = screen.getByRole("textbox", { name: "データセット名" });
    await user.clear(input);
    await user.type(input, "売上2024.csv");
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(
      await screen.findByRole("heading", { name: "売上2024.csv" }, WAIT),
    ).toBeInTheDocument();
    expect((await env.datasets.get(created.id)).name).toBe("売上2024.csv");
    expect(onDatasetsChanged).toHaveBeenCalled();
  });

  it("削除: confirm で断ると何も消えない", async () => {
    confirmSpy.mockReturnValue(false);
    const { user, created, onDatasetsChanged } = await openAs();
    await user.click(
      screen.getByRole("button", { name: "データセットを削除" }),
    );
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect((await env.datasets.get(created.id)).id).toBe(created.id);
    expect(
      screen.getByRole("heading", { name: "sales.csv" }),
    ).toBeInTheDocument();
    expect(onDatasetsChanged).not.toHaveBeenCalled();
  });

  it("削除: confirm で承諾すると remove され、一覧の取り直しを依頼し、一覧（/）へ移る", async () => {
    const { user, created, onDatasetsChanged } = await openAs();
    await user.click(
      screen.getByRole("button", { name: "データセットを削除" }),
    );
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("一覧ページ", {}, WAIT)).toBeInTheDocument();
    await expect(env.datasets.get(created.id)).rejects.toMatchObject({
      name: "NotFoundError",
    });
    expect(onDatasetsChanged).toHaveBeenCalled();
  });

  it("作成者でない人（共有されたデータセットを開いた Bob）には、切替・名前変更・削除を出さない", async () => {
    const created = await seedDataset(env, { visibility: "shared" });
    await openAs("bob", { dataset: created });
    expect(screen.queryByRole("button", { name: "公開にする" })).toBeNull();
    expect(screen.queryByRole("button", { name: "非公開にする" })).toBeNull();
    expect(screen.queryByRole("button", { name: "名前を変更" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "データセットを削除" }),
    ).toBeNull();
    expect(screen.getByText("公開")).toBeInTheDocument();
    expect(document.body).toHaveTextContent("Alice");
    expect(dataRows()).toHaveLength(5);
  });
});

describe("DatasetDetailPage: ビューの保存と復元", () => {
  it("「ビューを保存」で、今の設定が views.config と同じ形 { filters, sort, aggregation, chart } で保存される", async () => {
    const { user, created, me } = await openAs();
    await addFilter(user, "売上", "gte", "1000");
    await user.selectOptions(
      screen.getByRole("combobox", { name: "並べ替え" }),
      "売上",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "並べ替えの向き" }),
      "desc",
    );
    await saveViewAs(user, "高額だけ");

    const [saved] = await viewsOf(created.id);
    expect(saved.name).toBe("高額だけ");
    expect(saved.ownerId).toBe(me.id);
    expect(Object.keys(saved.config).sort()).toEqual([
      "aggregation",
      "chart",
      "filters",
      "sort",
    ]);
    expect(saved.config.filters).toEqual([
      { column: "売上", op: "gte", value: "1000" },
    ]);
    expect(saved.config.sort).toEqual({ column: "売上", direction: "desc" });
    expect(saved.config.aggregation).toBeNull();
    // 保存したビューが選択欄に出て、選択された状態になる
    const select = screen.getByRole("combobox", { name: "ビュー" });
    expect(select).toHaveValue(saved.id);
  });

  it("集計とグラフの設定も保存される", async () => {
    const { user, created } = await openAs();
    await setAggregation(user, {
      groupBy: ["店舗"],
      metric: { column: "売上", fn: "sum" },
    });
    const graph = section("グラフ");
    await user.selectOptions(
      within(graph).getByRole("combobox", { name: "グラフの種類" }),
      "bar",
    );
    await user.selectOptions(
      within(graph).getByRole("combobox", { name: "X軸" }),
      "店舗",
    );
    await user.selectOptions(
      within(graph).getByRole("combobox", { name: "Y軸" }),
      "売上_sum",
    );
    await saveViewAs(user, "店舗別売上");
    const [saved] = await viewsOf(created.id);
    expect(saved.config.aggregation).toEqual({
      groupBy: ["店舗"],
      metrics: [{ column: "売上", fn: "sum" }],
    });
    expect(saved.config.chart).toEqual({
      type: "bar",
      x: "店舗",
      y: "売上_sum",
    });
  });

  it("集計を外したあとに保存すると、グラフの軸は「今の元データにある列」だけになる（売上_sum は残らない）", async () => {
    const { user, created } = await openAs();
    await setAggregation(user, {
      groupBy: ["店舗"],
      metric: { column: "売上", fn: "sum" },
    });
    const graph = section("グラフ");
    await user.selectOptions(
      within(graph).getByRole("combobox", { name: "X軸" }),
      "店舗",
    );
    await user.selectOptions(
      within(graph).getByRole("combobox", { name: "Y軸" }),
      "売上_sum",
    );
    await user.click(
      within(
        within(section("集計")).getByRole("list", { name: "指標" }),
      ).getByRole("button", { name: /削除/ }),
    );
    await user.click(
      within(
        within(section("集計")).getByRole("group", { name: "グループ化" }),
      ).getByRole("checkbox", { name: "店舗" }),
    );
    await saveViewAs(user, "集計なし");
    const [saved] = await viewsOf(created.id);
    expect(saved.config.aggregation).toBeNull();
    expect(JSON.stringify(saved.config.chart)).not.toContain("売上_sum");
  });

  it("保存済みのビューを選ぶと、フィルタ・並べ替えが読み込まれる", async () => {
    const created = await seedDataset(env);
    await env.views.create({
      datasetId: created.id,
      name: "高額を降順",
      config: {
        filters: [{ column: "売上", op: "gte", value: "1500" }],
        sort: { column: "売上", direction: "desc" },
        aggregation: null,
        chart: null,
      },
    });
    const { user } = await openAs("alice", { dataset: created });
    const select = await screen.findByRole("combobox", { name: "ビュー" });
    await waitFor(() =>
      expect(
        within(select).getByRole("option", { name: /高額を降順/ }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(
      select,
      within(select).getByRole("option", { name: /高額を降順/ }),
    );
    expect(within(chipList()).getAllByRole("listitem")).toHaveLength(1);
    expect(dataRows()).toHaveLength(2);
    const first = within(dataRows()[0]).getAllByRole("cell");
    expect(first[3]).toHaveTextContent("2000");
    expect(screen.getByRole("combobox", { name: "並べ替え" })).toHaveValue(
      "売上",
    );
  });

  it("存在しない列の条件は無効化して「無効」を含む警告を出し、残りの条件だけで絞り込む", async () => {
    const created = await seedDataset(env);
    await env.views.create({
      datasetId: created.id,
      name: "古いビュー",
      config: {
        filters: [
          { column: "ghost", op: "eq", value: "x" },
          { column: "店舗", op: "eq", value: "東京" },
        ],
        sort: null,
        aggregation: null,
        chart: null,
      },
    });
    const { user } = await openAs("alice", { dataset: created });
    const select = await screen.findByRole("combobox", { name: "ビュー" });
    await waitFor(() =>
      expect(
        within(select).getByRole("option", { name: /古いビュー/ }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(
      select,
      within(select).getByRole("option", { name: /古いビュー/ }),
    );

    const warning = await screen.findByText(/ghost/);
    expect(warning).toBeInTheDocument();
    expect(document.body).toHaveTextContent(/無効/);
    const chips = within(chipList()).getAllByRole("listitem");
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveTextContent("東京");
    expect(dataRows()).toHaveLength(2);
  });

  it("ビュー由来で不正な条件（文字列の列に gt）があるときは、絞り込まず全件を出し、alert で理由を出す", async () => {
    const created = await seedDataset(env);
    await env.views.create({
      datasetId: created.id,
      name: "不正なビュー",
      config: {
        filters: [{ column: "店舗", op: "gt", value: "1" }],
        sort: null,
        aggregation: null,
        chart: null,
      },
    });
    const { user } = await openAs("alice", { dataset: created });
    const select = await screen.findByRole("combobox", { name: "ビュー" });
    await waitFor(() =>
      expect(
        within(select).getByRole("option", { name: /不正なビュー/ }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(
      select,
      within(select).getByRole("option", { name: /不正なビュー/ }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("店舗");
    expect(dataRows()).toHaveLength(5);
  });

  it("「ビューを編集」は、名前と今の設定で上書きする", async () => {
    const created = await seedDataset(env);
    const view = await env.views.create({
      datasetId: created.id,
      name: "旧名",
      config: { filters: [], sort: null, aggregation: null, chart: null },
    });
    const { user } = await openAs("alice", { dataset: created });
    const select = await screen.findByRole("combobox", { name: "ビュー" });
    await waitFor(() =>
      expect(
        within(select).getByRole("option", { name: /旧名/ }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(select, view.id);
    await addFilter(user, "店舗", "eq", "大阪");
    await user.click(screen.getByRole("button", { name: "ビューを編集" }));
    const dialog = screen.getByRole("dialog");
    const name = within(dialog).getByRole("textbox", { name: "ビュー名" });
    expect(name).toHaveValue("旧名");
    await user.clear(name);
    await user.type(name, "新名");
    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const [updated] = await viewsOf(created.id);
    expect(updated.id).toBe(view.id);
    expect(updated.name).toBe("新名");
    expect(updated.config.filters).toEqual([
      { column: "店舗", op: "eq", value: "大阪" },
    ]);
  });

  it("「ビューを削除」は confirm のあと remove する（断れば消えない）", async () => {
    const created = await seedDataset(env);
    const view = await env.views.create({
      datasetId: created.id,
      name: "消すビュー",
      config: { filters: [], sort: null, aggregation: null, chart: null },
    });
    const { user } = await openAs("alice", { dataset: created });
    const select = await screen.findByRole("combobox", { name: "ビュー" });
    await waitFor(() =>
      expect(
        within(select).getByRole("option", { name: /消すビュー/ }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(select, view.id);

    confirmSpy.mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: "ビューを削除" }));
    expect(await viewsOf(created.id)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "ビューを削除" }));
    await waitFor(async () =>
      expect(await viewsOf(created.id)).toHaveLength(0),
    );
    expect(
      within(screen.getByRole("combobox", { name: "ビュー" })).queryByRole(
        "option",
        {
          name: /消すビュー/,
        },
      ),
    ).toBeNull();
  });
});

describe("DatasetDetailPage: 他人のビュー（擬似ユーザー切替）", () => {
  async function setupShared() {
    const created = await seedDataset(env, { visibility: "shared" });
    const aliceView = await env.views.create({
      datasetId: created.id,
      name: "Aliceの東京",
      config: {
        filters: [{ column: "店舗", op: "eq", value: "東京" }],
        sort: null,
        aggregation: null,
        chart: null,
      },
    });
    return { created, aliceView };
  }

  it("Bob は Alice のビューを選んで見られるが、編集・削除ボタンは出ない", async () => {
    const { created, aliceView } = await setupShared();
    const { user } = await openAs("bob", { dataset: created });
    const select = await screen.findByRole("combobox", { name: "ビュー" });
    await waitFor(() =>
      expect(
        within(select).getByRole("option", { name: /Aliceの東京/ }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(select, aliceView.id);
    expect(dataRows()).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "ビューを編集" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ビューを削除" })).toBeNull();
  });

  it("他人のビューを開いて設定を変えても、Alice のビューは変わらない（変更は自分の画面上だけ）", async () => {
    const { created, aliceView } = await setupShared();
    const { user } = await openAs("bob", { dataset: created });
    const select = await screen.findByRole("combobox", { name: "ビュー" });
    await waitFor(() =>
      expect(
        within(select).getByRole("option", { name: /Aliceの東京/ }),
      ).toBeInTheDocument(),
    );
    await user.selectOptions(select, aliceView.id);
    await user.click(within(chipList()).getByRole("button", { name: /削除/ }));
    expect(dataRows()).toHaveLength(5);
    const [stored] = await viewsOf(created.id);
    expect(stored.config.filters).toEqual([
      { column: "店舗", op: "eq", value: "東京" },
    ]);
  });

  it("Bob は自分のビューを保存でき、所有者は Bob になる", async () => {
    const { created } = await setupShared();
    const { user, me } = await openAs("bob", { dataset: created });
    await addFilter(user, "店舗", "eq", "大阪");
    await saveViewAs(user, "Bobの大阪");
    const views = await viewsOf(created.id);
    const bobs = views.find((v) => v.name === "Bobの大阪");
    expect(bobs.ownerId).toBe(me.id);
    // 自分のビューを選んでいる間は、編集・削除が出る
    expect(
      screen.getByRole("button", { name: "ビューを編集" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ビューを削除" }),
    ).toBeInTheDocument();
  });
});
