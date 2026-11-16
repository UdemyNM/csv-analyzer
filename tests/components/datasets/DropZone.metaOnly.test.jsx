// 対象: src/components/datasets/DropZone.jsx（アップロード時のパースは、行を返さない metaOnly で依頼する）
// 背景: 保存に要るのは meta = { rowCount, encoding, columns } だけ。行（25 万行）をメインへ複製して捨てると、
//       約 0.3 秒メインスレッドが止まり、メモリも無駄になる（分析画面が改めてパースするため）。
// 仕様（変えない）: datasets.create({ name, visibility: 'private', file, meta }) の meta の形と値
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DropZone } from "../../../src/components/datasets/DropZone.jsx";
import { createAutoWorker, makeFile } from "../uiListHelpers.js";

function setup() {
  const requests = [];
  const autoWorker = createAutoWorker();
  const createWorker = () => {
    const worker = autoWorker();
    const post = worker.postMessage;
    worker.postMessage = (message, transfer) => {
      requests.push(message);
      return post(message, transfer);
    };
    return worker;
  };
  const datasets = {
    create: vi.fn(async (input) => ({
      id: "ds-new",
      ownerId: "u-alice",
      ...input,
    })),
  };
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route
          path="/"
          element={<DropZone datasets={datasets} createWorker={createWorker} />}
        />
        <Route path="/datasets/:id" element={<p>分析画面</p>} />
      </Routes>
    </MemoryRouter>,
  );
  const input = screen
    .getByTestId("drop-zone")
    .querySelector('input[type="file"]');
  return { datasets, requests, input };
}

describe("DropZone: アップロード時のパース", () => {
  it("Worker へ metaOnly: true で依頼し、meta（rowCount・encoding・columns）は従来どおり保存する", async () => {
    const { datasets, requests, input } = setup();
    await userEvent.upload(
      input,
      makeFile("sales.csv", "店舗,売上\n東京,100\n大阪,200\n名古屋,300\n"),
    );
    await waitFor(() => expect(datasets.create).toHaveBeenCalledTimes(1));

    expect(requests).toHaveLength(1);
    expect(requests[0].metaOnly).toBe(true);

    const arg = datasets.create.mock.calls[0][0];
    expect(arg.meta).toEqual({
      rowCount: 3,
      encoding: "utf-8",
      columns: [
        { name: "店舗", type: "string" },
        { name: "売上", type: "number" },
      ],
    });
    expect(arg.visibility).toBe("private");
    await screen.findByText("分析画面");
  });
});
