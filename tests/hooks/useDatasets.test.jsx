// 対象: src/hooks/useDatasets.js（名前付き export { useDatasets }）
// 仕様: docs/02 4 章 hooks（useDatasets）、docs/03 3・4 章（list は閲覧可能なものだけ／通信エラーは再試行つき）、FR-13
// 契約: const { datasets, status, error, reload } = useDatasets(datasetRepository, userId)
//   - status: 'loading' | 'ready' | 'error'。datasets は初期・失敗時とも []
//   - マウント時に list() を 1 回呼ぶ。reload() で取り直す（loading に戻る）
//   - userId が変わったら取り直す。このとき前のユーザーの一覧を残さない（即 [] ・loading）。
//     古いユーザーの遅れて届いた応答は捨てる（他人の非公開データが見えてしまうのを防ぐ）
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useDatasets } from "../../src/hooks/useDatasets.js";

const ds = (id, ownerId = "u-alice") => ({
  id,
  ownerId,
  name: `${id}.csv`,
  visibility: "private",
});

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("useDatasets", () => {
  it("初期は loading で空。list の結果が来たら ready になる", async () => {
    const list = vi.fn().mockResolvedValue([ds("a"), ds("b")]);
    const { result } = renderHook(() => useDatasets({ list }, "u-alice"));
    expect(result.current.status).toBe("loading");
    expect(result.current.datasets).toEqual([]);
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.datasets.map((d) => d.id)).toEqual(["a", "b"]);
    expect(result.current.error).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("list が失敗したら error になり、datasets は空・error に原因が入る", async () => {
    const list = vi.fn().mockRejectedValue(new Error("通信エラー"));
    const { result } = renderHook(() => useDatasets({ list }, "u-alice"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.datasets).toEqual([]);
    expect(result.current.error.message).toBe("通信エラー");
  });

  it("reload で取り直せる（失敗 → 再試行で成功）", async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("通信エラー"))
      .mockResolvedValueOnce([ds("a")]);
    const { result } = renderHook(() => useDatasets({ list }, "u-alice"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    act(() => {
      result.current.reload();
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.datasets.map((d) => d.id)).toEqual(["a"]);
    expect(result.current.error).toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("userId が変わったら取り直し、前のユーザーの一覧は即座に消える", async () => {
    const second = deferred();
    const list = vi
      .fn()
      .mockResolvedValueOnce([ds("alice-private")])
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ userId }) => useDatasets({ list }, userId),
      {
        initialProps: { userId: "u-alice" },
      },
    );
    await waitFor(() => expect(result.current.datasets).toHaveLength(1));

    rerender({ userId: "u-bob" });
    expect(result.current.status).toBe("loading");
    expect(result.current.datasets).toEqual([]);

    await act(async () => {
      second.resolve([ds("bob-private", "u-bob")]);
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.datasets.map((d) => d.id)).toEqual(["bob-private"]);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("古いユーザーの遅れた応答は捨てる", async () => {
    const first = deferred();
    const second = deferred();
    const list = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(
      ({ userId }) => useDatasets({ list }, userId),
      {
        initialProps: { userId: "u-alice" },
      },
    );
    rerender({ userId: "u-bob" });
    await act(async () => {
      second.resolve([ds("bob-private", "u-bob")]);
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      first.resolve([ds("alice-private")]);
    });
    expect(result.current.datasets.map((d) => d.id)).toEqual(["bob-private"]);
  });
});
