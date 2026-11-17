// 対象: src/workers/csvParse.worker.js
// Worker 本体はメッセージの受け口だけにし、処理は named export の handleParseRequest に置く（jsdom で直接テストするため）。
// メッセージ規約（useCsvAnalysis と共有。docs/03 7章「Worker でパース」の具体化として本テストで固定）:
//   リクエスト : { id, buffer: ArrayBuffer, encoding?: 'utf-8' | 'shift_jis' }   encoding 省略 = detectEncoding で自動判定
//   成功応答   : { id, ok: true,  result: { encoding, headers, rows, columns } }  columns = inferColumnTypes の結果
//   失敗応答   : { id, ok: false, error: { name, message } }                      例外は投げず、応答として返す
// 依存する utils（別トラックが実装中）: detectEncoding / parseCsv / inferColumnTypes（docs/03 2章の名前）
import { describe, it, expect } from "vitest";
import { handleParseRequest } from "../../src/workers/csvParse.worker.js";
import { SHIFT_JIS_BYTES } from "../repositories/contract/fixtures.js";

const bufferOf = (bytes) => {
  const u8 =
    bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(bytes);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
};

describe("handleParseRequest", () => {
  describe("正常系", () => {
    it("UTF-8 の CSV を解析し、文字コード・ヘッダー・行・列の型を返す", () => {
      const res = handleParseRequest({
        id: 1,
        buffer: bufferOf("name,age\nAlice,30\nBob,25\n"),
      });
      expect(res.ok).toBe(true);
      expect(res.result.encoding).toBe("utf-8");
      expect(res.result.headers).toEqual(["name", "age"]);
      expect(res.result.rows).toEqual([
        { name: "Alice", age: "30" },
        { name: "Bob", age: "25" },
      ]);
      expect(res.result.columns).toEqual([
        { name: "name", type: "string" },
        { name: "age", type: "number" },
      ]);
    });

    it("リクエストの id をそのまま応答に載せる", () => {
      expect(
        handleParseRequest({ id: 42, buffer: bufferOf("a\n1\n") }).id,
      ).toBe(42);
      expect(
        handleParseRequest({ id: "req-x", buffer: bufferOf("a\n1\n") }).id,
      ).toBe("req-x");
    });

    it("日付列を date と判定する", () => {
      const res = handleParseRequest({
        id: 1,
        buffer: bufferOf("日付,値\n2024-01-01,1\n2024-01-02,2\n"),
      });
      expect(res.result.columns).toEqual([
        { name: "日付", type: "date" },
        { name: "値", type: "number" },
      ]);
    });

    it("BOM 付き UTF-8 は、先頭の見出しに BOM が残らない", () => {
      const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
      const body = new TextEncoder().encode("店舗,売上\n東京,100\n");
      const merged = new Uint8Array(bom.length + body.length);
      merged.set(bom, 0);
      merged.set(body, bom.length);
      const res = handleParseRequest({ id: 1, buffer: bufferOf(merged) });
      expect(res.ok).toBe(true);
      expect(res.result.encoding).toBe("utf-8");
      expect(res.result.headers).toEqual(["店舗", "売上"]);
    });

    it("Shift_JIS を自動判定して正しく文字を復元する", () => {
      const res = handleParseRequest({
        id: 1,
        buffer: bufferOf(SHIFT_JIS_BYTES),
      });
      expect(res.ok).toBe(true);
      expect(res.result.encoding).toBe("shift_jis");
      expect(res.result.headers).toEqual(["名前", "売上"]);
      expect(res.result.rows).toEqual([{ 名前: "東京", 売上: "1000" }]);
    });

    it("encoding を明示すると自動判定より優先する（shift_jis 指定）", () => {
      const res = handleParseRequest({
        id: 1,
        buffer: bufferOf(SHIFT_JIS_BYTES),
        encoding: "shift_jis",
      });
      expect(res.result.encoding).toBe("shift_jis");
      expect(res.result.headers).toEqual(["名前", "売上"]);
    });

    it("encoding を明示すると自動判定より優先する（ASCII の utf-8 指定）", () => {
      const res = handleParseRequest({
        id: 1,
        buffer: bufferOf("a,b\n1,2\n"),
        encoding: "utf-8",
      });
      expect(res.result.encoding).toBe("utf-8");
      expect(res.result.headers).toEqual(["a", "b"]);
    });

    it("ヘッダーのみ（データ0行）は rows=[] で成功する", () => {
      const res = handleParseRequest({ id: 1, buffer: bufferOf("a,b\n") });
      expect(res.ok).toBe(true);
      expect(res.result.headers).toEqual(["a", "b"]);
      expect(res.result.rows).toEqual([]);
    });

    it("クォート内のカンマ・改行を含むセルを扱える", () => {
      const res = handleParseRequest({
        id: 1,
        buffer: bufferOf('a,b\n"x,1","l1\nl2"\n'),
      });
      expect(res.result.rows).toEqual([{ a: "x,1", b: "l1\nl2" }]);
    });

    it("応答は構造化複製（postMessage）できる単純なデータだけで構成される", () => {
      const res = handleParseRequest({
        id: 1,
        buffer: bufferOf("a,b\n1,2\n3,4\n"),
      });
      expect(() => structuredClone(res)).not.toThrow();
      expect(structuredClone(res)).toEqual(res);
    });

    it("数万行でも解析できる", () => {
      const lines = ["id,value"];
      for (let i = 0; i < 30000; i++) lines.push(`${i},${i * 2}`);
      const res = handleParseRequest({
        id: 1,
        buffer: bufferOf(lines.join("\n") + "\n"),
      });
      expect(res.ok).toBe(true);
      expect(res.result.rows).toHaveLength(30000);
      expect(res.result.rows[29999]).toEqual({ id: "29999", value: "59998" });
    });
  });

  describe("異常系（例外を投げず ok:false で返す）", () => {
    it("空のバッファは EmptyCsvError", () => {
      const res = handleParseRequest({ id: 7, buffer: new ArrayBuffer(0) });
      expect(res.ok).toBe(false);
      expect(res.id).toBe(7);
      expect(res.error.name).toBe("EmptyCsvError");
      expect(typeof res.error.message).toBe("string");
    });

    it("buffer が無いリクエストは、投げずに ok:false で返す", () => {
      let res;
      expect(() => {
        res = handleParseRequest({ id: 9 });
      }).not.toThrow();
      expect(res.ok).toBe(false);
      expect(res.id).toBe(9);
      expect(typeof res.error.name).toBe("string");
      expect(typeof res.error.message).toBe("string");
    });

    it("エラー応答も構造化複製できる", () => {
      const res = handleParseRequest({ id: 1, buffer: new ArrayBuffer(0) });
      expect(() => structuredClone(res)).not.toThrow();
    });
  });
});

describe("特別な名前の列（Worker から画面へ渡したあと）", () => {
  it("列名 __proto__ の値が、構造化複製（postMessage）のあとも読める", () => {
    const res = handleParseRequest({
      id: 1,
      buffer: bufferOf("__proto__,name\n100,alice\n"),
    });
    const received = structuredClone(res); // postMessage と同じ複製
    const row = received.result.rows[0];
    expect(Object.hasOwn(row, "__proto__")).toBe(true);
    expect(row["__proto__"]).toBe("100");
    expect(row.name).toBe("alice");
  });
});

describe("モジュールの読み込み", () => {
  it("Worker 以外（jsdom）で import しても例外を出さず、handleParseRequest を export する", () => {
    expect(typeof handleParseRequest).toBe("function");
  });
});
