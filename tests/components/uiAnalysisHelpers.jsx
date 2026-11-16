// ui-analysis トラック共通のテスト補助（テストファイルではない）
import { cloneElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { handleParseRequest } from "../../src/workers/csvParse.worker.js";
import { createLocalEnv } from "../repositories/local/createLocalEnv.js";
import {
  makeCsvFile,
  signInAs,
  utf8Bytes,
} from "../repositories/contract/fixtures.js";

/** 列定義の短縮 */
export const col = (name, type) => ({ name, type });

/** 詳細画面テスト用の CSV（5 行 × 5 列。店舗・商品=string、数量・売上=number、日付=date） */
export const SALES_CSV = [
  "店舗,商品,数量,売上,日付",
  "東京,りんご,10,1000,2024-01-01",
  "東京,みかん,5,500,2024-01-02",
  "大阪,りんご,20,2000,2024-01-03",
  "大阪,みかん,15,1500,2024-01-04",
  "名古屋,りんご,8,800,2024-01-05",
  "",
].join("\n");

export const SALES_COLUMNS = [
  col("店舗", "string"),
  col("商品", "string"),
  col("数量", "number"),
  col("売上", "number"),
  col("日付", "date"),
];

export const salesMeta = () => ({
  rowCount: 5,
  encoding: "utf-8",
  columns: SALES_COLUMNS,
});

/** Alice が作ったデータセット（既定は非公開）を保存して返す。呼んだ後の現在ユーザーは Alice。 */
export async function seedDataset(env, overrides = {}) {
  await signInAs(env, "alice");
  return env.datasets.create({
    name: "sales.csv",
    visibility: "private",
    file: makeCsvFile(utf8Bytes(SALES_CSV), "sales.csv"),
    meta: salesMeta(),
    ...overrides,
  });
}

export const OWNER_NAMES = {
  "u-alice": "Alice",
  "u-bob": "Bob",
  "u-carol": "Carol",
};

/**
 * 本物のパース処理（handleParseRequest）を、非同期で返す Worker 相当。
 * failFirst: true なら最初の 1 回だけ失敗応答を返す（再試行のテスト用）。
 */
export function createInlineWorkerFactory({ failFirst = false } = {}) {
  let calls = 0;
  return () => {
    const worker = {
      onmessage: null,
      onerror: null,
      terminated: false,
      postMessage(message) {
        calls += 1;
        const response =
          failFirst && calls === 1
            ? {
                id: message.id,
                ok: false,
                error: { name: "Error", message: "解析に失敗しました" },
              }
            : handleParseRequest(message);
        setTimeout(() => {
          if (!worker.terminated) worker.onmessage?.({ data: response });
        }, 0);
      },
      addEventListener() {},
      removeEventListener() {},
      terminate() {
        worker.terminated = true;
      },
    };
    return worker;
  };
}

/**
 * recharts の ResponsiveContainer を、固定サイズ（jsdom には幅がないため）で描くものに差し替える。
 * 各テストファイルで:
 *   vi.mock("recharts", async (orig) => (await import("../uiAnalysisHelpers.jsx")).withSizedContainer(await orig()));
 * ChartView は ResponsiveContainer（recharts の名前付き export）を使うこと。
 */
export function withSizedContainer(actual) {
  return {
    ...actual,
    ResponsiveContainer: ({ children }) =>
      cloneElement(children, { width: 600, height: 300 }),
  };
}

/** DatasetDetailPage の props（repository はラッパー経由で差し替えられる） */
export function wrapRepository(repo, overrides = {}) {
  return {
    list: (...a) => repo.list(...a),
    get: (...a) => repo.get(...a),
    create: (...a) => repo.create(...a),
    update: (...a) => repo.update(...a),
    remove: (...a) => repo.remove(...a),
    downloadCsv: (...a) => repo.downloadCsv(...a),
    ...overrides,
  };
}

/** 詳細画面を /datasets/:id で描く。削除後の遷移先 "/" には「一覧ページ」を出す。 */
export function renderDetailPage(
  DatasetDetailPage,
  {
    env,
    datasetId,
    currentUser,
    datasetRepository = env.datasets,
    createWorker = createInlineWorkerFactory(),
    onDatasetsChanged = vi.fn(),
  } = {},
) {
  const utils = render(
    <MemoryRouter initialEntries={[`/datasets/${datasetId}`]}>
      <Routes>
        <Route
          path="/datasets/:id"
          element={
            <DatasetDetailPage
              datasetRepository={datasetRepository}
              viewRepository={env.views}
              currentUser={currentUser}
              ownerNames={OWNER_NAMES}
              createWorker={createWorker}
              onDatasetsChanged={onDatasetsChanged}
            />
          }
        />
        <Route path="/" element={<p>一覧ページ</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return { ...utils, onDatasetsChanged };
}

export { createLocalEnv, signInAs };

/** セルの文字を数値にする（カンマ・全角マイナスを許容）。数値でなければ NaN */
export const toNumber = (text) =>
  Number(text.trim().replace(/,/g, "").replace(/[−–—]/g, "-"));

/** 空欄・null 相当の表示（「-」「—」「」など）。"NaN" "null" "undefined" は不可 */
export const isBlankMark = (text) => /^\s*[-–—−－]?\s*$/.test(text);
