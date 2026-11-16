// 対象: src/components/datasets/DropZone.jsx（名前付き export { DropZone }）
// 仕様: docs/05 2・5・8 章、docs/03 4 章、docs/01 FR-10・FR-15、docs/04 Phase 5b
// 仕様に細部がないため、本テストで固定した契約（実装担当への指示）:
//   <DropZone datasets={DatasetRepository} createWorker={() => Worker相当} />   ※ createWorker は省略可（省略時は本物の Worker）
//   - ルート要素に data-testid="drop-zone"。中に input[type=file]（accept に .csv）と、
//     role=button「ファイルを選ぶ」（押すと input を開く）を持つ
//   - ドラッグ中（dragenter/dragover）は枠内に「ここで離すと、分析を始めます」を出し、dragleave / drop で消す。
//     dragover と drop は preventDefault する（ブラウザがファイルを開かないように）
//   - 検証: サイズ > 10MB（10×1024×1024 バイトちょうどは可）/ 拡張子が .csv 以外 / 空 → 枠内の role=alert に理由。create しない・移動しない
//     理由の文言: サイズは「10MB」を含む / 拡張子は「.csv」を含む / 空は「データがありません」
//   - 通れば Worker でパースし、datasets.create({ name: ファイル名, visibility: 'private', file, meta }) を呼ぶ
//     meta = { rowCount, encoding, columns: [{name, type}] }（tests/repositories/contract/fixtures.js の META と同じ形）
//   - 成功したら /datasets/:id へ navigate し、location.state = { justUploaded: true }（UploadNotice を出す合図）
//   - 保存やパースの失敗も枠内の role=alert に出し、移動しない
import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  createEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Routes,
  Route,
  useParams,
  useLocation,
} from "react-router-dom";
import { DropZone } from "../../../src/components/datasets/DropZone.jsx";
import { SHIFT_JIS_BYTES } from "../../repositories/contract/fixtures.js";
import {
  MAX_BYTES,
  createAutoWorker,
  dataTransferOf,
  makeFile,
} from "../uiListHelpers.js";

function DetailProbe() {
  const { id } = useParams();
  const location = useLocation();
  return (
    <div data-testid="detail">{`${id}|${String(location.state?.justUploaded)}`}</div>
  );
}

function setup({ create } = {}) {
  const datasets = {
    create:
      create ??
      vi.fn(async (input) => ({ id: "ds-new", ownerId: "u-alice", ...input })),
  };
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="/"
          element={
            <DropZone datasets={datasets} createWorker={createAutoWorker()} />
          }
        />
        <Route path="/datasets/:id" element={<DetailProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  const zone = screen.getByTestId("drop-zone");
  const input = zone.querySelector('input[type="file"]');
  return { datasets, zone, input };
}

// 「ドロップ」と「ファイルを選ぶ」のどちらでも同じ結果になること
const HOW = ["drop", "select"];
function give(how, { zone, input }, file) {
  if (how === "drop") fireEvent.drop(zone, dataTransferOf([file]));
  else fireEvent.change(input, { target: { files: [file] } });
}

describe("DropZone: 見た目と操作部品", () => {
  it("「ファイルを選ぶ」ボタンと、.csv を受け付ける file input を持つ", () => {
    const { zone, input } = setup();
    expect(
      within(zone).getByRole("button", { name: "ファイルを選ぶ" }),
    ).toBeInTheDocument();
    expect(input).not.toBeNull();
    expect(input.getAttribute("accept")).toMatch(/\.csv/);
  });

  it("「ファイルを選ぶ」を押すと、ファイル選択（input の click）が開く", async () => {
    const { zone, input } = setup();
    const clickSpy = vi.spyOn(input, "click");
    await userEvent
      .setup()
      .click(within(zone).getByRole("button", { name: "ファイルを選ぶ" }));
    expect(clickSpy).toHaveBeenCalled();
  });

  it("初期状態ではエラーも「ここで離すと…」も出ない", () => {
    const { zone } = setup();
    expect(within(zone).queryByRole("alert")).toBeNull();
    expect(within(zone).queryByText("ここで離すと、分析を始めます")).toBeNull();
  });
});

describe("DropZone: ドラッグ中の表示", () => {
  it("dragenter で「ここで離すと、分析を始めます」が出て、dragleave で消える", () => {
    const { zone } = setup();
    fireEvent.dragEnter(zone, dataTransferOf());
    expect(
      within(zone).getByText("ここで離すと、分析を始めます"),
    ).toBeInTheDocument();
    fireEvent.dragLeave(zone, dataTransferOf());
    expect(within(zone).queryByText("ここで離すと、分析を始めます")).toBeNull();
  });

  it("dragover でも同じ文言が出る", () => {
    const { zone } = setup();
    fireEvent.dragOver(zone, dataTransferOf());
    expect(
      within(zone).getByText("ここで離すと、分析を始めます"),
    ).toBeInTheDocument();
  });

  it("dragover と drop は preventDefault する（ブラウザがファイルを開かない）", () => {
    const { zone } = setup();
    const over = createEvent.dragOver(zone, dataTransferOf());
    fireEvent(zone, over);
    expect(over.defaultPrevented).toBe(true);
    const drop = createEvent.drop(zone, dataTransferOf([makeFile("a.csv")]));
    fireEvent(zone, drop);
    expect(drop.defaultPrevented).toBe(true);
  });

  it("drop したら「ここで離すと…」は消える", async () => {
    const { zone } = setup();
    fireEvent.dragEnter(zone, dataTransferOf());
    fireEvent.drop(zone, dataTransferOf([makeFile("a.csv")]));
    expect(within(zone).queryByText("ここで離すと、分析を始めます")).toBeNull();
    await screen.findByTestId("detail"); // 非同期の続きを待ってから終える
  });
});

describe.each(HOW)("DropZone: 正常系（%s）", (how) => {
  it("private で create し、/datasets/:id へ移動して、justUploaded を渡す", async () => {
    const parts = setup();
    const file = makeFile("sales.csv");
    give(how, parts, file);

    expect(await screen.findByTestId("detail")).toHaveTextContent(
      "ds-new|true",
    );
    expect(parts.datasets.create).toHaveBeenCalledTimes(1);
    expect(parts.datasets.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "sales.csv",
        visibility: "private",
        file,
        meta: expect.objectContaining({
          rowCount: 2,
          encoding: "utf-8",
          columns: [
            { name: "店舗", type: "string" },
            { name: "売上", type: "number" },
          ],
        }),
      }),
    );
  });

  it("名前は入力させず、ファイル名がそのままデータセット名になる", async () => {
    const parts = setup();
    give(how, parts, makeFile("2024年 売上(確定版).csv"));
    await screen.findByTestId("detail");
    expect(parts.datasets.create.mock.calls[0][0].name).toBe(
      "2024年 売上(確定版).csv",
    );
  });

  it("Shift_JIS の CSV は文字コードを判定して meta.encoding に入れる（FR-11）", async () => {
    const parts = setup();
    give(how, parts, makeFile("sjis.csv", SHIFT_JIS_BYTES));
    await screen.findByTestId("detail");
    expect(parts.datasets.create.mock.calls[0][0].meta).toEqual(
      expect.objectContaining({
        encoding: "shift_jis",
        rowCount: 1,
        columns: [
          { name: "名前", type: "string" },
          { name: "売上", type: "number" },
        ],
      }),
    );
  });

  it("ヘッダーだけ（データ0行）の CSV は成功する（rowCount: 0）", async () => {
    const parts = setup();
    give(how, parts, makeFile("header-only.csv", "店舗,売上\n"));
    await screen.findByTestId("detail");
    expect(parts.datasets.create.mock.calls[0][0].meta.rowCount).toBe(0);
  });

  it("ちょうど 10MB は受け付ける（境界値）", async () => {
    const parts = setup();
    give(how, parts, makeFile("edge.csv", undefined, { size: MAX_BYTES }));
    await screen.findByTestId("detail");
    expect(parts.datasets.create).toHaveBeenCalledTimes(1);
  });
});

describe.each(HOW)("DropZone: 検証エラー（%s）", (how) => {
  async function expectRejected(parts, matcher) {
    const alert = await within(parts.zone).findByRole("alert");
    expect(alert).toHaveTextContent(matcher);
    expect(parts.datasets.create).not.toHaveBeenCalled();
    expect(screen.queryByTestId("detail")).toBeNull();
    // 画面は一覧のまま（ドロップ枠が残っている）
    expect(screen.getByTestId("drop-zone")).toBeInTheDocument();
  }

  it("10MB を 1 バイトでも超えたら、理由を枠内に出して移動しない", async () => {
    const parts = setup();
    give(how, parts, makeFile("big.csv", undefined, { size: MAX_BYTES + 1 }));
    await expectRejected(parts, /10\s?MB/i);
  });

  it(".csv 以外は、理由を枠内に出して移動しない", async () => {
    const parts = setup();
    give(how, parts, makeFile("memo.txt", "a,b\n1,2\n"));
    await expectRejected(parts, /\.csv/);
  });

  it("空ファイル（0 バイト）は「データがありません」", async () => {
    const parts = setup();
    give(how, parts, makeFile("empty.csv", ""));
    await expectRejected(parts, "データがありません");
  });

  it("改行だけで中身のない CSV も「データがありません」（パース側の EmptyCsvError）", async () => {
    const parts = setup();
    give(how, parts, makeFile("blank.csv", "\n\n"));
    await expectRejected(parts, "データがありません");
  });

  it("1 行目の列名がすべて空欄の CSV は「ヘッダー」がない旨を出す（FR-15）", async () => {
    const parts = setup();
    give(how, parts, makeFile("noheader.csv", ",,\n1,2,3\n"));
    await expectRejected(parts, "ヘッダー");
  });
});

describe("DropZone: エラーからの復帰・保存の失敗", () => {
  it("エラーの後に正しい CSV を渡すと、先へ進める", async () => {
    const parts = setup();
    give("drop", parts, makeFile("memo.txt"));
    await within(parts.zone).findByRole("alert");
    give("drop", parts, makeFile("ok.csv"));
    expect(await screen.findByTestId("detail")).toHaveTextContent(
      "ds-new|true",
    );
    expect(parts.datasets.create).toHaveBeenCalledTimes(1);
  });

  it("create が失敗したら、理由を枠内に出して移動しない", async () => {
    const create = vi.fn().mockRejectedValue(new Error("保存できませんでした"));
    const parts = setup({ create });
    give("drop", parts, makeFile("ok.csv"));
    const alert = await within(parts.zone).findByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(screen.queryByTestId("detail")).toBeNull();
  });
});
