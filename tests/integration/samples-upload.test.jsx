// 対象: samples/ の 3 つの CSV を、実ファイルのバイト列のまま DropZone から入れ、分析画面で見る（統合テスト）
// 仕様: docs/03 1・2.3・2.6・4・7 章、docs/02 2.3（データフロー）、docs/05 2 章、samples/README.md「確かめ方の例」
// 構成: <App>（HashRouter）＋ LocalAuth / LocalDatasetRepository / LocalViewRepository（fake-indexeddb）＋ 本物のパース処理
//   - ドロップ枠の input[type=file] に実ファイル（File）を渡す → パース → 保存（非公開）→ /datasets/:id へ移動
//   - 詳細画面は React.lazy で読む本物。recharts の ResponsiveContainer だけ固定サイズに差し替える（jsdom に幅がない）
//   - 期待値は README の数字と、実装を使わない参照計算（tests/sampleHelpers.js）
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  within,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../../src/App.jsx";
import { createLocalEnv } from "../repositories/local/createLocalEnv.js";
import { signInAs } from "../repositories/contract/fixtures.js";
import { createAutoWorker } from "../components/uiListHelpers.js";
import {
  SJIS_GRAND_TOTAL,
  SURVEY_COMMENTS,
  pearson,
  readSampleBytes,
  sampleFile,
  sampleStdDev,
} from "../sampleHelpers.js";

vi.mock("recharts", async (orig) =>
  (await import("../components/uiAnalysisHelpers.jsx")).withSizedContainer(
    await orig(),
  ),
);
vi.setConfig({ testTimeout: 60000 });

const WAIT = { timeout: 15000 };
const fmt = (n) => n.toLocaleString("ja-JP", { maximumFractionDigits: 4 });

let env;

beforeEach(async () => {
  env = await createLocalEnv();
  await signInAs(env, "alice");
  window.location.hash = "#/";
});
afterEach(() => {
  window.location.hash = "";
});

function renderApp() {
  render(
    <App
      auth={env.auth}
      datasets={env.datasets}
      views={env.views}
      createWorker={createAutoWorker()}
    />,
  );
}

/** ドロップ枠に、実ファイルを渡して、分析画面（見出し=ファイル名）が出るまで待つ */
async function upload(name) {
  const zone = await screen.findByTestId("drop-zone", {}, WAIT);
  const input = zone.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [sampleFile(name)] } });
  await screen.findByRole("heading", { name, level: 1 }, WAIT);
  await screen.findByRole("region", { name: "データ表の内容" }, WAIT);
}

/** 実ファイルをアップロードして、分析画面を開いた状態にする */
async function openSample(name) {
  renderApp();
  await upload(name);
  return userEvent.setup();
}

const section = (name) => screen.getByRole("region", { name });
const texts = (nodes) => nodes.map((n) => n.textContent);
const dataTable = () => screen.getByRole("region", { name: "データ表の内容" });
const HIDDEN = { hidden: true }; // 統計・相関は初期で閉じている（中身は DOM にある）
/** 見出しの文字（データ表は列名だけ。▼ メニューと「行の操作」の列は除く） */
const headerTexts = (scope, options = {}) =>
  within(scope)
    .getAllByRole("columnheader", options)
    .filter((th) => !th.classList.contains("data-table__row-action"))
    .map((th) => (th.querySelector(".th-menu__label") ?? th).textContent);
/** 表の本体の行（ヘッダー行を除く）を、セルの文字の配列にする（行を非表示にするボタンの列は除く） */
const bodyRows = (scope) =>
  within(scope)
    .getAllByRole("row")
    .filter((r) => within(r).queryAllByRole("columnheader").length === 0)
    .map((r) =>
      texts(
        within(r)
          .getAllByRole("cell")
          .filter((c) => !c.classList.contains("data-table__row-action")),
      ),
    );

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
  if (value !== "") {
    await user.type(within(menu).getByRole("textbox", { name: "値" }), value);
  }
  await user.click(within(menu).getByRole("button", { name: "追加" }));
}

/** 集計の枠の「＋」で列を足す */
async function addToSlot(user, slotLabel, column) {
  const box = section("集計");
  await user.click(
    within(box).getByRole("button", { name: `${slotLabel}に列を追加` }),
  );
  await user.click(
    within(
      within(box).getByRole("list", { name: `${slotLabel}に追加する列` }),
    ).getByRole("button", { name: column }),
  );
}

async function groupBy(user, names) {
  for (const name of names) await addToSlot(user, "行", name);
}

const FN_LABELS = {
  sum: "合計",
  avg: "平均",
  count: "件数",
  min: "最小",
  max: "最大",
};

/** 値の枠に列を置き、集計方法を fn にする（数値の列は合計、それ以外は件数で入る） */
async function addMetric(user, { column, fn }) {
  await addToSlot(user, "値", column);
  const select = within(section("集計"))
    .getAllByRole("combobox")
    .filter((c) => c.getAttribute("aria-label")?.startsWith(`「${column}・`))
    .at(-1);
  if (select.value !== fn) await user.selectOptions(select, fn);
}

const aggregateResult = () => screen.getByRole("region", { name: "集計結果" });

/** 統計・相関を開く（初期は閉じていて、閉じているあいだは中身を作らない） */
async function openStats(user) {
  await user.click(screen.getByRole("button", { name: "統計・相関を開く" }));
}

/** 基本統計の、列ごとの行（[件数, 平均, 中央値, 標準偏差, 最小, 最大] の文字） */
function statsRow(column) {
  const stats = screen.getByRole("heading", {
    name: "基本統計",
    ...HIDDEN,
  }).parentElement;
  const row = within(stats)
    .getByRole("rowheader", { name: column, ...HIDDEN })
    .closest("tr");
  return texts(within(row).getAllByRole("cell", HIDDEN));
}

/** 相関行列（列の並びと、行ごとのセルの文字） */
function correlationMatrix() {
  const box = screen.getByRole("heading", { name: "相関行列", ...HIDDEN })
    .parentElement.parentElement;
  const names = headerTexts(box, HIDDEN).filter((t) => t !== "列");
  const rows = within(box)
    .getAllByRole("row", HIDDEN)
    .filter((r) => within(r).queryAllByRole("rowheader", HIDDEN).length > 0)
    .map((r) => texts(within(r).getAllByRole("cell", HIDDEN)));
  return { names, rows };
}

/** survey.csv の満足度（実装を使わず、正規表現で取り出す。200 件） */
const surveyText = () => readSampleBytes("survey.csv").toString("utf-8");

describe("sales_2024q1.csv をアップロードして分析画面で見る", () => {
  it("アップロードすると /datasets/:id へ移り、概要（1,092 行 × 6 列・UTF-8・非公開・作成者）を出す", async () => {
    await openSample("sales_2024q1.csv");
    expect(window.location.hash).toMatch(/^#\/datasets\/.+/);
    expect(screen.getByText("アップロードしました")).toBeInTheDocument();
    expect(screen.getByText("非公開")).toBeInTheDocument();
    const meta = document.querySelector(".dataset-header__meta");
    expect(meta).toHaveTextContent(/1,092\s*行\s*×\s*6\s*列/);
    expect(meta).toHaveTextContent("UTF-8");
    expect(meta).toHaveTextContent("Alice");
  });

  it("データ表: 見出し 6 列・1,092 件・先頭行・1 ページ 100 行（1 / 11）", async () => {
    await openSample("sales_2024q1.csv");
    expect(headerTexts(dataTable())).toEqual([
      "日付",
      "店舗",
      "商品",
      "数量",
      "単価",
      "売上",
    ]);
    expect(screen.getByText("1,092 件")).toBeInTheDocument();
    const rows = bodyRows(dataTable());
    expect(rows).toHaveLength(100);
    expect(rows[0]).toEqual([
      "2024-01-01",
      "新宿店",
      "りんご",
      "38",
      "120",
      "4560",
    ]);
    expect(screen.getByText("1 / 11")).toBeInTheDocument();
  });

  it("集計: 店舗ごとの売上合計が 988,880 / 870,140 / 757,940 / 655,180", async () => {
    const user = await openSample("sales_2024q1.csv");
    await groupBy(user, ["店舗"]);
    await addMetric(user, { column: "売上", fn: "sum" });
    expect(Object.fromEntries(bodyRows(aggregateResult()))).toEqual({
      新宿店: "988,880",
      渋谷店: "870,140",
      池袋店: "757,940",
      横浜店: "655,180",
    });
  });

  it("フィルタ（日付 ≥ 2024-02-01 かつ ≤ 2024-02-29）で 348 件。集計も 2 月だけ（931,520）になる", async () => {
    const user = await openSample("sales_2024q1.csv");
    await addFilter(user, "日付", "gte", "2024-02-01");
    await addFilter(user, "日付", "lte", "2024-02-29");
    await waitFor(() => expect(screen.getByText("348 件")).toBeInTheDocument());
    await addMetric(user, { column: "売上", fn: "sum" });
    expect(bodyRows(aggregateResult())).toEqual([["931,520"]]);
  });

  it("統計・相関: 売上の件数と平均、数量・単価・売上の相関行列が参照計算と一致", async () => {
    const user = await openSample("sales_2024q1.csv");
    await openStats(user);
    expect(statsRow("売上").slice(0, 2)).toEqual([
      "1,092",
      fmt(3272140 / 1092),
    ]);
    const { names, rows } = correlationMatrix();
    expect(names).toEqual(["数量", "単価", "売上"]);
    expect(rows).toHaveLength(3);
    const lines = readSampleBytes("sales_2024q1.csv")
      .toString("utf-8")
      .trim()
      .split("\n");
    const data = lines.slice(1).map((l) => l.split(","));
    const col = (i) => data.map((r) => Number(r[i]));
    const series = { 数量: col(3), 単価: col(4), 売上: col(5) };
    names.forEach((rowName, i) =>
      names.forEach((colName, j) => {
        expect(rows[i][j]).toBe(
          pearson(series[rowName], series[colName]).toFixed(2),
        );
      }),
    );
  });
});

describe("sales_excel_sjis.csv をアップロードして分析画面で見る", () => {
  it("概要: 13 行 × 6 列・文字コード Shift_JIS", async () => {
    await openSample("sales_excel_sjis.csv");
    const meta = document.querySelector(".dataset-header__meta");
    expect(meta).toHaveTextContent(/13\s*行\s*×\s*6\s*列/);
    expect(meta).toHaveTextContent("Shift_JIS");
  });

  it("データ表: 文字化けしない。カンマ付きの数は 1 セル。合計行が最後にある", async () => {
    await openSample("sales_excel_sjis.csv");
    expect(headerTexts(dataTable())).toEqual([
      "店舗",
      "商品",
      "1月",
      "2月",
      "3月",
      "合計",
    ]);
    expect(dataTable().textContent).not.toContain("�");
    const rows = bodyRows(dataTable());
    expect(rows).toHaveLength(13);
    expect(rows[0]).toEqual([
      "新宿店",
      "りんご",
      "116,040",
      "92,760",
      "135,600",
      "344,400",
    ]);
    expect(rows.at(-1)).toEqual([
      "合計",
      "",
      "1,094,440",
      "931,520",
      "1,246,180",
      "3,272,140",
    ]);
    expect(screen.getByText("13 件")).toBeInTheDocument();
  });

  it("README: 合計行を含めて集計すると 2 倍。店舗 ≠ 合計 の条件で除けば合計行の数字と同じ", async () => {
    const user = await openSample("sales_excel_sjis.csv");
    await addMetric(user, { column: "1月", fn: "sum" });
    await addMetric(user, { column: "合計", fn: "sum" });
    expect(bodyRows(aggregateResult())).toEqual([
      [fmt(SJIS_GRAND_TOTAL["1月"] * 2), fmt(SJIS_GRAND_TOTAL["合計"] * 2)],
    ]);

    await addFilter(user, "店舗", "ne", "合計");
    await waitFor(() => expect(screen.getByText("12 件")).toBeInTheDocument());
    expect(bodyRows(aggregateResult())).toEqual([
      [fmt(SJIS_GRAND_TOTAL["1月"]), fmt(SJIS_GRAND_TOTAL["合計"])],
    ]);
  });

  it("合計行を除いて 店舗ごとに「合計」を集計すると、sales_2024q1 の店舗別と同じ", async () => {
    const user = await openSample("sales_excel_sjis.csv");
    await addFilter(user, "店舗", "ne", "合計");
    await groupBy(user, ["店舗"]);
    await addMetric(user, { column: "合計", fn: "sum" });
    expect(Object.fromEntries(bodyRows(aggregateResult()))).toEqual({
      新宿店: "988,880",
      渋谷店: "870,140",
      池袋店: "757,940",
      横浜店: "655,180",
    });
  });

  it("並べ替え: 合計の降順では、カンマ付きでも数値順（先頭は合計行 3,272,140、次が 344,400）", async () => {
    const user = await openSample("sales_excel_sjis.csv");
    const menu = await openColumnMenu(user, "合計");
    await user.click(within(menu).getByRole("button", { name: "降順" }));
    await waitFor(() => expect(bodyRows(dataTable())[0][5]).toBe("3,272,140"));
    expect(bodyRows(dataTable())[1][5]).toBe("344,400");
  });

  it("統計: カンマ付きの列（1月）も数値列として、件数 13・最小 70,200・最大 1,094,440", async () => {
    const user = await openSample("sales_excel_sjis.csv");
    await openStats(user);
    const [count, , , , min, max] = statsRow("1月");
    expect(count).toBe("13");
    expect(min).toBe("70,200");
    expect(max).toBe("1,094,440");
    expect(correlationMatrix().names).toEqual(["1月", "2月", "3月", "合計"]);
  });
});

describe("survey.csv をアップロードして分析画面で見る", () => {
  it("概要: 200 行 × 8 列・UTF-8。見出しに BOM が残らない", async () => {
    await openSample("survey.csv");
    const meta = document.querySelector(".dataset-header__meta");
    expect(meta).toHaveTextContent(/200\s*行\s*×\s*8\s*列/);
    expect(meta).toHaveTextContent("UTF-8");
    const headers = headerTexts(dataTable());
    expect(headers).toEqual([
      "回答ID",
      "回答日時",
      "店舗",
      "年代",
      "満足度",
      "買った商品",
      "感想",
      "再来店",
    ]);
    expect(headers[0]).toBe("回答ID"); // 先頭に U+FEFF が付かない
    expect(screen.getByText("200 件")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("「感想」が切れず、列もずれない: 2 ページ分の全 200 行が 8 セル・ID が 1〜200 の順・感想は 12 種類", async () => {
    const user = await openSample("survey.csv");
    const all = [...bodyRows(dataTable())];
    expect(all).toHaveLength(100);
    await user.click(screen.getByRole("button", { name: "次へ" }));
    await screen.findByText("2 / 2");
    all.push(...bodyRows(dataTable()));
    expect(all).toHaveLength(200);
    all.forEach((cells, i) => {
      expect(cells).toHaveLength(8);
      expect(cells[0]).toBe(String(i + 1));
    });
    expect(new Set(all.map((c) => c[6]))).toEqual(SURVEY_COMMENTS);
    // 改行・半角カンマ・二重引用符を含む感想が、そのまま 1 セルに表示される
    const comments = all.map((c) => c[6]);
    expect(comments.filter((c) => c.includes("\n"))).toHaveLength(14);
    expect(comments.filter((c) => c.includes(","))).toHaveLength(17);
    expect(comments.filter((c) => c.includes('"'))).toHaveLength(18);
    // 空欄は空のセル（年代 14・感想 33・再来店 18）
    expect(all.filter((c) => c[3] === "")).toHaveLength(14);
    expect(all.filter((c) => c[6] === "")).toHaveLength(33);
    expect(all.filter((c) => c[7] === "")).toHaveLength(18);
    expect(all[0]).toEqual([
      "1",
      "2024-01-01 13:35:05",
      "渋谷店",
      "10代",
      "4",
      "みかん",
      "",
      "はい",
    ]);
  });

  it("フィルタ: 感想が空欄（= 空文字）で 33 件", async () => {
    const user = await openSample("survey.csv");
    await addFilter(user, "感想", "eq", "");
    await waitFor(() => expect(screen.getByText("33 件")).toBeInTheDocument());
    for (const cells of bodyRows(dataTable())) expect(cells[6]).toBe("");
  });

  it("フィルタ: 感想に「駐車場」を含む行は 14 件で、改行入りの感想が切れずに出る", async () => {
    const user = await openSample("survey.csv");
    await addFilter(user, "感想", "contains", "駐車場");
    await waitFor(() => expect(screen.getByText("14 件")).toBeInTheDocument());
    for (const cells of bodyRows(dataTable())) {
      expect(cells[6]).toBe("駐車場が狭い。\n週末は止められなかった");
    }
  });

  it("統計: 満足度は 200 件・平均 3.93・中央値 4・標準偏差・最小 1・最大 5。回答ID は平均 100.5", async () => {
    const user = await openSample("survey.csv");
    await openStats(user);
    const values = [
      ...surveyText().matchAll(/^\d+,2024-[^,]+,[^,]+,[^,]*,(\d),/gm),
    ].map((m) => Number(m[1]));
    expect(values).toHaveLength(200);
    expect(statsRow("満足度")).toEqual([
      "200",
      "3.93",
      "4",
      fmt(sampleStdDev(values)),
      "1",
      "5",
      "0", // 欠損数（FR-25）: 200 行すべてに値がある
    ]);
    expect(statsRow("回答ID").slice(0, 3)).toEqual(["200", "100.5", "100.5"]);
    // 文字の列は基本統計に出ない
    const stats = screen.getByRole("heading", {
      name: "基本統計",
      ...HIDDEN,
    }).parentElement;
    expect(
      within(stats).queryByRole("rowheader", { name: "感想", ...HIDDEN }),
    ).toBeNull();
  });

  it("相関: 回答ID と 満足度の 2×2（対角 1.00・対称）", async () => {
    const user = await openSample("survey.csv");
    await openStats(user);
    const { names, rows } = correlationMatrix();
    expect(names).toEqual(["回答ID", "満足度"]);
    expect(rows[0][0]).toBe("1.00");
    expect(rows[1][1]).toBe("1.00");
    expect(rows[0][1]).toBe(rows[1][0]);
    expect(rows[0][1]).toMatch(/^-?\d\.\d{2}$/);
  });

  it("集計: 再来店ごとの件数は はい145・いいえ37・空欄18", async () => {
    const user = await openSample("survey.csv");
    await groupBy(user, ["再来店"]);
    // 件数は、文字の列（再来店）を値の枠に置いて数える。空欄のキーは「（空欄）」と出す
    await addMetric(user, { column: "再来店", fn: "count" });
    expect(Object.fromEntries(bodyRows(aggregateResult()))).toEqual({
      はい: "145",
      いいえ: "37",
      "（空欄）": "18",
    });
  });

  it("集計: 店舗ごとの満足度の平均が参照計算と一致", async () => {
    const user = await openSample("survey.csv");
    await groupBy(user, ["店舗"]);
    await addMetric(user, { column: "満足度", fn: "avg" });
    const byStore = {};
    for (const m of surveyText().matchAll(
      /^\d+,2024-[^,]+,([^,]+),[^,]*,(\d),/gm,
    )) {
      (byStore[m[1]] ||= []).push(Number(m[2]));
    }
    const expected = Object.fromEntries(
      Object.entries(byStore).map(([store, v]) => [
        store,
        fmt(v.reduce((a, b) => a + b, 0) / v.length),
      ]),
    );
    expect(Object.keys(expected)).toHaveLength(4);
    expect(Object.fromEntries(bodyRows(aggregateResult()))).toEqual(expected);
  });
});

describe("3 つのファイルを続けてアップロード（保存の中身）", () => {
  const NAMES = ["sales_2024q1.csv", "sales_excel_sjis.csv", "survey.csv"];
  const backLink = () =>
    screen.findByRole("link", { name: /データ一覧に戻る/ }, WAIT);

  it("一覧に 3 件並び、保存された原本は元のバイト列と同じ。行数・文字コード・列の型が記録される", async () => {
    renderApp();
    const user = userEvent.setup();
    for (const [i, name] of NAMES.entries()) {
      if (i > 0) await user.click(await backLink());
      await upload(name);
    }
    await user.click(await backLink());
    for (const name of NAMES) {
      expect(
        await screen.findByRole("link", { name }, WAIT),
      ).toBeInTheDocument();
    }

    const list = await env.datasets.list();
    expect(list).toHaveLength(3);
    const byName = Object.fromEntries(list.map((d) => [d.name, d]));
    for (const d of list) {
      expect(d.visibility).toBe("private");
      expect(d.ownerId).toBe("u-alice");
    }
    expect(byName["sales_2024q1.csv"].meta).toMatchObject({
      rowCount: 1092,
      encoding: "utf-8",
    });
    expect(byName["sales_excel_sjis.csv"].meta).toMatchObject({
      rowCount: 13,
      encoding: "shift_jis",
    });
    expect(byName["survey.csv"].meta).toMatchObject({
      rowCount: 200,
      encoding: "utf-8",
    });
    expect(byName["sales_excel_sjis.csv"].meta.columns).toEqual([
      { name: "店舗", type: "string" },
      { name: "商品", type: "string" },
      { name: "1月", type: "number" },
      { name: "2月", type: "number" },
      { name: "3月", type: "number" },
      { name: "合計", type: "number" },
    ]);
    expect(
      Object.fromEntries(
        byName["survey.csv"].meta.columns.map((c) => [c.name, c.type]),
      ),
    ).toMatchObject({ 回答ID: "number", 満足度: "number", 感想: "string" });

    for (const name of NAMES) {
      const stored = new Uint8Array(
        await env.datasets.downloadCsv(byName[name].id),
      );
      expect([...stored]).toEqual([...readSampleBytes(name)]);
    }
  });

  it("保存したデータセットを、あとから一覧のリンクで開き直しても同じ分析画面になる（sales_excel_sjis）", async () => {
    renderApp();
    const user = userEvent.setup();
    await upload("sales_excel_sjis.csv");
    await user.click(await backLink());
    await user.click(
      await screen.findByRole("link", { name: "sales_excel_sjis.csv" }, WAIT),
    );
    await screen.findByRole("region", { name: "データ表の内容" }, WAIT);
    expect(bodyRows(dataTable())).toHaveLength(13);
    expect(bodyRows(dataTable())[0][2]).toBe("116,040");
    // 一覧から開いたときは「アップロードしました」は出ない
    expect(screen.queryByText("アップロードしました")).toBeNull();
  });
});
