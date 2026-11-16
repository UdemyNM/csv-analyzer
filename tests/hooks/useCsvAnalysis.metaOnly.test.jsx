// 対象: src/hooks/useCsvAnalysis.js（parse の metaOnly オプション）
// 契約: parse(buffer, { metaOnly: true }) は Worker へのメッセージに metaOnly: true を載せる。
//       指定しなければ metaOnly を載せない（従来の { id, buffer } のまま）。
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCsvAnalysis } from "../../src/hooks/useCsvAnalysis.js";
import { createFakeWorkerHarness } from "./fakeWorker.js";

const bufferOf = (text) => {
  const u8 = new TextEncoder().encode(text);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
};

describe("useCsvAnalysis: metaOnly", () => {
  it("parse(buffer, { metaOnly: true }) は Worker へ metaOnly: true を送る", () => {
    const h = createFakeWorkerHarness();
    const { result } = renderHook(() =>
      useCsvAnalysis({ createWorker: h.createWorker }),
    );
    act(() => {
      result.current
        .parse(bufferOf("a\n1\n"), { metaOnly: true })
        .catch(() => {});
    });
    expect(h.posted[0].message.metaOnly).toBe(true);
  });

  it("指定しなければ metaOnly は送らない", () => {
    const h = createFakeWorkerHarness();
    const { result } = renderHook(() =>
      useCsvAnalysis({ createWorker: h.createWorker }),
    );
    act(() => {
      result.current.parse(bufferOf("a\n1\n")).catch(() => {});
    });
    expect(h.posted[0].message).not.toHaveProperty("metaOnly");
  });
});
