// 対象: src/hooks/useCsvAnalysis.js
// docs/03 7章「Worker でパース（useCsvAnalysis）。通信・パースの失敗は alert と『再試行』」、
// docs/01 非機能「パースで UI を固めない（Web Worker）」より。仕様に細部がないため本テストで固定した契約:
//   const { status, data, error, parse, reset } = useCsvAnalysis({ createWorker })
//   - createWorker: () => Worker 相当。省略時は本物の csvParse.worker.js を new Worker する（テストでは必ず差し替える）
//   - status: 'idle' | 'parsing' | 'done' | 'error'。data は成功時の result、error は失敗時の Error（name を保つ）
//   - parse(buffer, { encoding }?) は Promise を返す（成功: result で resolve / 失敗: error で reject）。状態も更新する
//   - Worker へのメッセージは { id, buffer, encoding }（tests/workers/csvParse.worker.test.js の規約）。
//     応答は { id, ok:true, result } | { id, ok:false, error:{name,message} }
//   - 最後に呼んだ parse の結果だけが状態に反映される。アンマウント時は Worker を破棄し、以後 state を更新しない
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCsvAnalysis } from "../../src/hooks/useCsvAnalysis.js";
import { createFakeWorkerHarness } from "./fakeWorker.js";

const bufferOf = (text) => {
  const u8 = new TextEncoder().encode(text);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
};
const bytesOf = (buf) => Array.from(new Uint8Array(buf));

const RESULT = {
  encoding: "utf-8",
  headers: ["a", "b"],
  rows: [{ a: "1", b: "2" }],
  columns: [
    { name: "a", type: "number" },
    { name: "b", type: "number" },
  ],
};

const setup = () => {
  const h = createFakeWorkerHarness();
  const hook = renderHook(() =>
    useCsvAnalysis({ createWorker: h.createWorker }),
  );
  return { h, ...hook };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCsvAnalysis", () => {
  it("初期状態は idle で、data / error は null", () => {
    const { result } = setup();
    expect(result.current.status).toBe("idle");
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(typeof result.current.parse).toBe("function");
    expect(typeof result.current.reset).toBe("function");
  });

  it("parse を呼ぶと parsing になり、Worker へ id と buffer を送る", () => {
    const { result, h } = setup();
    const buf = bufferOf("a,b\n1,2\n");
    const expected = bytesOf(buf);
    let promise;
    act(() => {
      promise = result.current.parse(buf);
    });
    promise.catch(() => {});
    expect(result.current.status).toBe("parsing");
    expect(h.posted).toHaveLength(1);
    expect(h.posted[0].message.id).toBeDefined();
    expect(bytesOf(h.posted[0].message.buffer)).toEqual(expected);
  });

  it("encoding 未指定のときは自動判定（Worker へ encoding を渡さない）", () => {
    const { result, h } = setup();
    act(() => {
      result.current.parse(bufferOf("a\n1\n")).catch(() => {});
    });
    expect(h.posted[0].message.encoding ?? null).toBeNull();
  });

  it("encoding を指定すると Worker へそのまま渡す", () => {
    const { result, h } = setup();
    act(() => {
      result.current
        .parse(bufferOf("a\n1\n"), { encoding: "shift_jis" })
        .catch(() => {});
    });
    expect(h.posted[0].message.encoding).toBe("shift_jis");
  });

  it("成功応答で done になり、data に result が入り、parse は result で resolve する", async () => {
    const { result, h } = setup();
    let promise;
    act(() => {
      promise = result.current.parse(bufferOf("a,b\n1,2\n"));
    });
    await act(async () => {
      h.respond(0, { ok: true, result: RESULT });
      await promise;
    });
    expect(result.current.status).toBe("done");
    expect(result.current.data).toEqual(RESULT);
    expect(result.current.error).toBeNull();
    await expect(promise).resolves.toEqual(RESULT);
  });

  it("Worker が失敗応答を返すと error になり、error.name を保ったまま parse が reject する", async () => {
    const { result, h } = setup();
    let promise;
    act(() => {
      promise = result.current.parse(new ArrayBuffer(0));
    });
    const assertion = expect(promise).rejects.toMatchObject({
      name: "EmptyCsvError",
    });
    await act(async () => {
      h.respond(0, {
        ok: false,
        error: { name: "EmptyCsvError", message: "データがありません" },
      });
      await assertion;
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.name).toBe("EmptyCsvError");
    expect(result.current.error.message).toBe("データがありません");
    expect(result.current.data).toBeNull();
  });

  it("Worker 自体のエラー（クラッシュ）でも error になり、parse が reject する", async () => {
    const { result, h } = setup();
    let promise;
    act(() => {
      promise = result.current.parse(bufferOf("a\n1\n"));
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(Error);
    await act(async () => {
      h.crash(0, "boom");
      await assertion;
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.data).toBeNull();
  });

  it("失敗したあとにもう一度 parse すると（再試行）、成功して error が消える", async () => {
    const { result, h } = setup();
    let first;
    act(() => {
      first = result.current.parse(bufferOf("a\n1\n"));
    });
    const firstAssertion = expect(first).rejects.toBeDefined();
    await act(async () => {
      h.respond(0, { ok: false, error: { name: "Error", message: "失敗" } });
      await firstAssertion;
    });
    expect(result.current.status).toBe("error");

    let second;
    act(() => {
      second = result.current.parse(bufferOf("a,b\n1,2\n"));
    });
    expect(result.current.status).toBe("parsing");
    expect(result.current.error).toBeNull();
    await act(async () => {
      h.respond(1, { ok: true, result: RESULT });
      await second;
    });
    expect(result.current.status).toBe("done");
    expect(result.current.data).toEqual(RESULT);
    expect(result.current.error).toBeNull();
  });

  it("続けて parse したとき、最後の呼び出しの結果だけが反映される（古い応答は無視）", async () => {
    const { result, h } = setup();
    const OTHER = {
      ...RESULT,
      headers: ["x"],
      rows: [{ x: "9" }],
      columns: [{ name: "x", type: "number" }],
    };
    let first;
    let second;
    act(() => {
      first = result.current.parse(bufferOf("a,b\n1,2\n"));
      first.catch(() => {});
      second = result.current.parse(bufferOf("x\n9\n"));
      second.catch(() => {});
    });
    expect(h.posted).toHaveLength(2);
    await act(async () => {
      h.respond(1, { ok: true, result: OTHER }); // 新しい方が先に返る
      await second;
    });
    await act(async () => {
      h.respond(0, { ok: true, result: RESULT }); // 古い方があとから返る
      await Promise.resolve();
    });
    expect(result.current.status).toBe("done");
    expect(result.current.data).toEqual(OTHER);
  });

  it("reset で idle に戻り、data / error が消える", async () => {
    const { result, h } = setup();
    let promise;
    act(() => {
      promise = result.current.parse(bufferOf("a,b\n1,2\n"));
    });
    await act(async () => {
      h.respond(0, { ok: true, result: RESULT });
      await promise;
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("parse 中に reset したら、あとから届いた応答は無視する", async () => {
    const { result, h } = setup();
    act(() => {
      result.current.parse(bufferOf("a,b\n1,2\n")).catch(() => {});
    });
    act(() => {
      result.current.reset();
    });
    await act(async () => {
      h.respond(0, { ok: true, result: RESULT });
      await Promise.resolve();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.data).toBeNull();
  });

  it("アンマウント時に Worker を破棄し、以後の応答で警告やエラーを出さない", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { result, h, unmount } = setup();
    act(() => {
      result.current.parse(bufferOf("a,b\n1,2\n")).catch(() => {});
    });
    unmount();
    expect(h.workers.length).toBeGreaterThan(0);
    expect(h.workers.every((w) => w.terminated)).toBe(true);
    // 破棄後に届いても何も起きない（fake は terminate 済みへは配送しない）
    h.respond(0, { ok: true, result: RESULT });
    await Promise.resolve();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
