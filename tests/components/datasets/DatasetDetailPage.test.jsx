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
//   - 配置（設計書 docs/superpowers/specs/2026-11-16-analysis-page-redesign-design.md 5.1）: .analysis-grid の中に
//     データ表・グラフ・集計（CollapsibleSection）。統計・相関はその下で、初期は閉じる
//   - フィルタバーはセクションの外（条件・非表示の行・非表示の列のチップと「すべて解除」）。条件の追加と並べ替えは
//     データ表の列見出しのメニュー（値から選ぶ／自由入力）で行う
//   - 設定は views.config と同じ新しい形 { filters, sort, hiddenRows, hiddenColumns, pivot, chart }
//   - 行の流れ: 元の行 → 非表示の行を除く → 絞り込み → 並べ替え。全セクションはこの後の行を使う
//   - 集計はピボット（行・列・値の枠）。グラフの X軸・系列・Y軸は集計の行・列・値と同じ枠。散布図だけは元の行
//   - 自由入力の条件が InvalidFilterError になるときは、追加せずメニューの中に role="alert" で理由を出す。
//     ビュー由来で不正な条件があるときは、絞り込まず全件を出し、role="alert" に理由を出す
//   - ビュー: 「ビューを保存」→ SaveViewDialog → viewRepository.create（config は今の設定そのもの）。
//     保存すると、そのビューが選択された状態になる。選択すると設定を読み込む（古い形は新しい形に変換し、
//     集計なしのグラフを集計に変換したときは知らせる）。存在しない列の設定は無効化し、「無効」を含む警告を出す。
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
const anySection = (name) => screen.getByRole("region", { name, hidden: true });
const toggleOf = (name) =>
  document.querySelector(`[aria-controls="${anySection(name).id}"]`);
const tableRows = (scope) =>
  within(scope)
    .getAllByRole("row")
    .filter((r) => within(r).queryAllByRole("columnheader").length === 0);
const dataRows = () =>
  tableRows(screen.getByRole("region", { name: "データ表の内容" }));
const cellsOf = (row) =>
  within(row)
    .getAllByRole("cell")
    .slice(1) // 先頭は「行を非表示」ボタンの列
    .map((c) => c.textContent);
const chipList = () => screen.queryByRole("list", { name: "絞り込み条件" });

/** データ表の列見出しのメニューを開く */
async function openColumnMenu(user, column) {
  await user.click(
    within(section("データ表")).getByRole("button", {
      name: new RegExp(`^「${column}」の列のメニュー`),
    }),
  );
  return screen.getByRole("dialog", { name: `「${column}」の列の操作` });
}

/** 列見出しのメニューの「自由入力」で条件を足す */
async function addFilter(user, column, op, value) {
  const menu = await openColumnMenu(user, column);
  await user.click(within(menu).getByRole("radio", { name: "自由入力" }));
  await user.selectOptions(
    within(menu).getByRole("combobox", { name: "演算子" }),
    op,
  );
  await user.type(within(menu).getByRole("textbox", { name: "値" }), value);
  await user.click(within(menu).getByRole("button", { name: "追加" }));
}

/** 列見出しのメニューで並べ替える */
async function sortBy(user, column, direction) {
  const menu = await openColumnMenu(user, column);
  await user.click(
    within(menu).getByRole("button", {
      name: direction === "desc" ? "降順" : "昇順",
    }),
  );
}

/** 枠の「＋」で列を足す（scope は集計かグラフのセクション） */
async function addToSlot(user, scope, slotLabel, column) {
  await user.click(
    within(scope).getByRole("button", { name: `${slotLabel}に列を追加` }),
  );
  await user.click(
    within(
      within(scope).getByRole("list", { name: `${slotLabel}に追加する列` }),
    ).getByRole("button", { name: column }),
  );
}

/** ピボット: 行に rows、値に values（数値の列は合計）を置く */
async function setPivot(user, { rows = [], columns = [], values = [] }) {
  const box = section("集計");
  for (const name of rows) await addToSlot(user, box, "行", name);
  for (const name of columns) await addToSlot(user, box, "列", name);
  for (const name of values) await addToSlot(user, box, "値", name);
}

async function openStats(user) {
  if (toggleOf("統計・相関").getAttribute("aria-expanded") === "false") {
    await user.click(toggleOf("統計・相関"));
  }
  return section("統計・相関");
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

describe("DatasetDetailPage: セクションと配置（設計書 5.1）", () => {
  it("データ表・グラフ・集計は analysis-grid の中、統計・相関はその下。順番は データ表 → グラフ → 集計 → 統計・相関", async () => {
    await openAs();
    const grid = document.querySelector(".analysis-grid");
    for (const name of ["データ表", "グラフ", "集計"]) {
      expect(grid.contains(section(name))).toBe(true);
    }
    expect(grid.contains(anySection("統計・相関"))).toBe(false);
    const regions = SECTIONS.map(anySection);
    for (let i = 0; i < regions.length - 1; i++) {
      expect(
        regions[i].compareDocumentPosition(regions[i + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("統計・相関だけ初期で閉じていて、ほかは開いている", async () => {
    const { user } = await openAs();
    for (const name of ["データ表", "グラフ", "集計"]) {
      expect(toggleOf(name)).toHaveAttribute("aria-expanded", "true");
    }
    expect(toggleOf("統計・相関")).toHaveAttribute("aria-expanded", "false");
    expect(anySection("統計・相関")).not.toBeVisible();
    await openStats(user);
    expect(section("統計・相関")).toBeVisible();
  });

  it("開閉ボタンで 1 つだけ畳める（ほかは開いたまま）", async () => {
    const { user } = await openAs();
    await user.click(toggleOf("グラフ"));
    expect(toggleOf("グラフ")).toHaveAttribute("aria-expanded", "false");
    expect(anySection("グラフ")).not.toBeVisible();
    expect(section("データ表")).toBeVisible();
    expect(section("集計")).toBeVisible();
  });

  it("フィルタバーはセクションの外にあり、「＋条件を追加」は無い", async () => {
    await openAs();
    const hint = screen.getByText("列見出しの ▼ から絞り込めます");
    for (const name of SECTIONS) {
      expect(anySection(name).contains(hint)).toBe(false);
    }
    expect(screen.queryByRole("button", { name: /条件を追加/ })).toBeNull();
  });
});

describe("DatasetDetailPage: データ表と絞り込み・並べ替え", () => {
  it("データ表に全行（5 行）を、CSV の値のまま出す", async () => {
    await openAs();
    expect(dataRows()).toHaveLength(5);
    expect(cellsOf(dataRows()[0])[0]).toBe("東京");
  });

  it("列メニューの「値から選ぶ」で東京だけ外すと、データ表・集計・統計が 3 行になり、チップ「店舗: 東京 以外」", async () => {
    const { user } = await openAs();
    await setPivot(user, { rows: ["店舗"], values: ["売上"] });
    const menu = await openColumnMenu(user, "店舗");
    await user.click(within(menu).getByRole("checkbox", { name: /^東京/ }));
    await user.click(within(menu).getByRole("button", { name: "適用" }));

    expect(within(chipList()).getAllByRole("listitem")[0]).toHaveTextContent(
      "店舗: 東京 以外",
    );
    expect(dataRows()).toHaveLength(3);
    const result = within(section("集計")).getByRole("region", {
      name: "集計結果",
    });
    expect(tableRows(result)).toHaveLength(2); // 大阪・名古屋
    const stats = await openStats(user);
    const salesRow = within(within(stats).getAllByRole("table")[0])
      .getAllByRole("row")
      .find((r) => within(r).queryByRole("rowheader", { name: "売上" }));
    expect(within(salesRow).getAllByRole("cell")[0]).toHaveTextContent("3");
  });

  it("自由入力の条件（売上 ≥ 1000）でチップが出て、データ表が絞り込まれる", async () => {
    const { user } = await openAs();
    await addFilter(user, "売上", "gte", "1000");
    const chips = within(chipList()).getAllByRole("listitem");
    expect(chips).toHaveLength(1);
    expect(chips[0]).toHaveTextContent("売上 ≥ 1000");
    expect(dataRows()).toHaveLength(3);
  });

  it("チップの × で条件を外すと、全行に戻る", async () => {
    const { user } = await openAs();
    await addFilter(user, "店舗", "eq", "東京");
    expect(dataRows()).toHaveLength(2);
    await user.click(within(chipList()).getByRole("button", { name: /削除/ }));
    expect(dataRows()).toHaveLength(5);
  });

  it("自由入力で不正な条件（数値列に abc）は、メニューの中に alert を出し、条件は増えない", async () => {
    const { user } = await openAs();
    await addFilter(user, "売上", "gt", "abc");
    const menu = screen.getByRole("dialog", { name: "「売上」の列の操作" });
    expect(within(menu).getByRole("alert")).toHaveTextContent("abc");
    expect(chipList()).toBeNull();
    expect(dataRows()).toHaveLength(5);
  });

  it("列メニューの降順で、データ表が売上の降順になる", async () => {
    const { user } = await openAs();
    await sortBy(user, "売上", "desc");
    expect(cellsOf(dataRows()[0])[3]).toBe("2000");
    expect(cellsOf(dataRows()[4])[3]).toBe("500");
    const th = within(section("データ表"))
      .getAllByRole("columnheader")
      .find((h) => h.textContent.includes("売上"));
    expect(th).toHaveAttribute("aria-sort", "descending");
  });

  it("「すべて解除」で、条件・非表示の行と列が戻る", async () => {
    const { user } = await openAs();
    await addFilter(user, "店舗", "eq", "東京");
    await user.click(screen.getByRole("button", { name: "1 行目を非表示" }));
    await user.click(screen.getByRole("button", { name: "すべて解除" }));
    expect(dataRows()).toHaveLength(5);
    expect(chipList()).toBeNull();
  });
});

describe("DatasetDetailPage: 行と列の非表示（設計書 6.2 / 6.3）", () => {
  it("2 行目を隠すと、データ表・集計・統計から消え、「非表示の行 1件」の × で戻る", async () => {
    const { user } = await openAs();
    await setPivot(user, { values: ["売上"] });
    await user.click(screen.getByRole("button", { name: "2 行目を非表示" })); // 東京・みかん・500
    expect(dataRows()).toHaveLength(4);
    const result = within(section("集計")).getByRole("region", {
      name: "集計結果",
    });
    expect(tableRows(result)[0]).toHaveTextContent("5,300");
    const stats = await openStats(user);
    const salesRow = within(within(stats).getAllByRole("table")[0])
      .getAllByRole("row")
      .find((r) => within(r).queryByRole("rowheader", { name: "売上" }));
    expect(within(salesRow).getAllByRole("cell")[0]).toHaveTextContent("4");

    expect(screen.getByText("非表示の行 1件")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "非表示の行をすべて表示" }),
    );
    expect(dataRows()).toHaveLength(5);
  });

  it("並べ替えたあとでも、押した行（元の行番号）が隠れる", async () => {
    const { user } = await openAs();
    await sortBy(user, "売上", "desc");
    // 先頭は 大阪・りんご・2000（元の 3 行目）
    await user.click(screen.getByRole("button", { name: "3 行目を非表示" }));
    expect(cellsOf(dataRows()[0])[3]).toBe("1500");
  });

  it("列を隠すと表から消え、集計の列名一覧には残る。チップの × で戻る", async () => {
    const { user } = await openAs();
    const menu = await openColumnMenu(user, "数量");
    await user.click(
      within(menu).getByRole("button", { name: "この列を非表示" }),
    );
    const headers = within(section("データ表"))
      .getAllByRole("columnheader")
      .map((h) => h.textContent)
      .join("|");
    expect(headers).not.toContain("数量");
    expect(
      within(
        within(section("集計")).getByRole("list", { name: "列名" }),
      ).getByText("数量"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "列「数量」を表示" }));
    expect(
      within(section("データ表"))
        .getAllByRole("columnheader")
        .some((h) => h.textContent.includes("数量")),
    ).toBe(true);
  });

  it("条件と並べ替えのかかった列を隠しても、チップは残り、並べ替えも効いたまま（Review Focus 4）", async () => {
    const { user } = await openAs();
    await addFilter(user, "売上", "gte", "1000");
    await sortBy(user, "売上", "desc");
    const menu = await openColumnMenu(user, "売上");
    await user.click(
      within(menu).getByRole("button", { name: "この列を非表示" }),
    );
    expect(within(chipList()).getByText("売上 ≥ 1000")).toBeInTheDocument();
    expect(dataRows()).toHaveLength(3);
    expect(cellsOf(dataRows()[0])[0]).toBe("大阪"); // 2000 が先頭のまま
  });
});

describe("DatasetDetailPage: ピボットとピボットグラフ（設計書 7・8 章）", () => {
  it("行に店舗・値に売上 → 集計結果（店舗ごとの合計）と、グラフ（role=img）が出る", async () => {
    const { user } = await openAs();
    await setPivot(user, { rows: ["店舗"], values: ["売上"] });
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
    const img = await within(section("グラフ")).findByRole("img", {}, WAIT);
    expect(img).toHaveAttribute(
      "aria-label",
      "棒グラフ: X軸 店舗、系列 売上・合計",
    );
  });

  it("集計は絞り込み後の行に対して行う", async () => {
    const { user } = await openAs();
    await addFilter(user, "商品", "eq", "りんご");
    await setPivot(user, { rows: ["店舗"], values: ["売上"] });
    const result = within(section("集計")).getByRole("region", {
      name: "集計結果",
    });
    expect(
      tableRows(result).map(
        (r) => within(r).getAllByRole("cell")[1].textContent,
      ),
    ).toEqual(["1,000", "2,000", "800"]);
  });

  it("グラフの「系列」に商品を置くと、集計の「列」にも出て、表がクロス集計になる", async () => {
    const { user } = await openAs();
    await setPivot(user, { rows: ["店舗"], values: ["売上"] });
    await addToSlot(user, section("グラフ"), "系列", "商品");
    expect(
      within(
        within(section("集計")).getByRole("group", { name: "列" }),
      ).getByText("商品"),
    ).toBeInTheDocument();
    const result = within(section("集計")).getByRole("region", {
      name: "集計結果",
    });
    expect(
      within(result)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["店舗", "みかん", "りんご"]);
    const img = within(section("グラフ")).getByRole("img");
    expect(img.getAttribute("aria-label")).toContain("系列 みかん・りんご");
  });

  it("値の集計方法を平均に変えると、表とグラフに反映される", async () => {
    const { user } = await openAs();
    await setPivot(user, { rows: ["店舗"], values: ["売上"] });
    await user.selectOptions(
      within(section("集計")).getByRole("combobox", {
        name: "「売上・合計」の集計方法",
      }),
      "avg",
    );
    const result = within(section("集計")).getByRole("region", {
      name: "集計結果",
    });
    expect(tableRows(result)[0]).toHaveTextContent("750");
    expect(
      within(section("グラフ")).getByRole("img").getAttribute("aria-label"),
    ).toContain("売上・平均");
  });

  it("散布図: 数量 × 売上を描ける", async () => {
    const { user } = await openAs();
    const graph = section("グラフ");
    await user.click(within(graph).getByRole("button", { name: "散布図" }));
    await addToSlot(user, graph, "X軸", "数量");
    await addToSlot(user, graph, "Y軸", "売上");
    expect(await within(graph).findByRole("img", {}, WAIT)).toHaveAttribute(
      "aria-label",
      "散布図: X軸 数量、Y軸 売上",
    );
  });
});

describe("DatasetDetailPage: 統計・相関と「？」", () => {
  it("統計は数値列（数量・売上）、相関行列も数値列だけ", async () => {
    const { user } = await openAs();
    const stats = await openStats(user);
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
    await openStats(user);
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
  it("「ビューを保存」で、今の設定が新しい形 { filters, sort, hiddenRows, hiddenColumns, pivot, chart } で保存される", async () => {
    const { user, created, me } = await openAs();
    await addFilter(user, "売上", "gte", "1000");
    await sortBy(user, "売上", "desc");
    await saveViewAs(user, "高額だけ");

    const [saved] = await viewsOf(created.id);
    expect(saved.name).toBe("高額だけ");
    expect(saved.ownerId).toBe(me.id);
    expect(Object.keys(saved.config).sort()).toEqual([
      "chart",
      "filters",
      "hiddenColumns",
      "hiddenRows",
      "pivot",
      "sort",
    ]);
    expect(saved.config.filters).toEqual([
      { column: "売上", op: "gte", value: "1000" },
    ]);
    expect(saved.config.sort).toEqual({ column: "売上", direction: "desc" });
    expect(saved.config.pivot).toBeNull();
    // 保存したビューが選択欄に出て、選択された状態になる
    const select = screen.getByRole("combobox", { name: "ビュー" });
    expect(select).toHaveValue(saved.id);
  });

  it("非表示の行・列、ピボット、グラフの種類と散布図の軸も保存される", async () => {
    const { user, created } = await openAs();
    await user.click(screen.getByRole("button", { name: "2 行目を非表示" }));
    const menu = await openColumnMenu(user, "日付");
    await user.click(
      within(menu).getByRole("button", { name: "この列を非表示" }),
    );
    await setPivot(user, {
      rows: ["店舗"],
      columns: ["商品"],
      values: ["売上"],
    });
    const graph = section("グラフ");
    await user.click(within(graph).getByRole("button", { name: "散布図" }));
    await addToSlot(user, graph, "X軸", "数量");
    await addToSlot(user, graph, "Y軸", "売上");
    await user.click(within(graph).getByRole("button", { name: "折れ線" }));
    await saveViewAs(user, "全部入り");

    const [saved] = await viewsOf(created.id);
    expect(saved.config.hiddenRows).toEqual([1]);
    expect(saved.config.hiddenColumns).toEqual(["日付"]);
    expect(saved.config.pivot).toEqual({
      rows: ["店舗"],
      columns: ["商品"],
      values: [{ column: "売上", fn: "sum" }],
    });
    expect(saved.config.chart).toEqual({
      type: "line",
      scatter: { x: "数量", y: "売上" },
    });
  });

  it("古い形（集計あり・集計なしの棒）のビューを開くと、ピボットに変換し、変換の知らせを出す", async () => {
    const created = await seedDataset(env);
    await env.views.create({
      datasetId: created.id,
      name: "古い集計",
      config: {
        filters: [],
        sort: null,
        aggregation: { groupBy: ["商品"], metrics: [{ fn: "count" }] },
        chart: { type: "bar", x: "商品", y: "count" },
      },
    });
    await env.views.create({
      datasetId: created.id,
      name: "古いグラフ",
      config: {
        filters: [],
        sort: null,
        aggregation: null,
        chart: { type: "bar", x: "店舗", y: "売上" },
      },
    });
    const { user } = await openAs("alice", { dataset: created });
    const select = await screen.findByRole("combobox", { name: "ビュー" });
    await waitFor(() =>
      expect(
        within(select).getByRole("option", { name: /古いグラフ/ }),
      ).toBeInTheDocument(),
    );

    await user.selectOptions(
      select,
      within(select).getByRole("option", { name: /古い集計/ }),
    );
    expect(
      within(
        within(section("集計")).getByRole("group", { name: "行" }),
      ).getByText("商品"),
    ).toBeInTheDocument();
    expect(
      within(section("集計")).getByRole("combobox", {
        name: "「件数」の集計方法",
      }),
    ).toBeInTheDocument();

    await user.selectOptions(
      select,
      within(select).getByRole("option", { name: /古いグラフ/ }),
    );
    expect(
      await screen.findByText(
        /グラフの設定を集計（行＝店舗、値＝売上の合計）に変換しました/,
      ),
    ).toBeInTheDocument();
    const result = within(section("集計")).getByRole("region", {
      name: "集計結果",
    });
    expect(tableRows(result)).toHaveLength(3);
    expect(within(section("グラフ")).getByRole("img")).toBeInTheDocument();
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
    expect(cellsOf(dataRows()[0])[3]).toBe("2000");
    const th = within(section("データ表"))
      .getAllByRole("columnheader")
      .find((h) => h.textContent.includes("売上"));
    expect(th).toHaveAttribute("aria-sort", "descending");
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
