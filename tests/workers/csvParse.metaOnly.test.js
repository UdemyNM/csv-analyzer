// 対象: src/workers/csvParse.worker.js（handleParseRequest の metaOnly オプション）
// 背景: アップロード時の 1 回目のパースは、行数・文字コード・列の型だけが要る（行は捨てる）。
//       25 万行を Worker→メインへ複製すると、約 0.3 秒メインスレッドが止まるため、行を返さない応答を選べるようにする。
// 契約:
//   リクエスト : { id, buffer, encoding?, metaOnly?: true }
//   metaOnly 成功応答: { id, ok: true, result: { encoding, headers, rowCount, columns } }（rows を含めない）
//   metaOnly 省略 / false: 従来どおり { encoding, headers, rows, columns }（rowCount は付けない）
import { describe, it, expect } from "vitest";
import { handleParseRequest } from "../../src/workers/csvParse.worker.js";

const bufferOf = (text) => {
  const u8 = new TextEncoder().encode(text);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
};

describe("handleParseRequest: metaOnly", () => {
  it("metaOnly: true なら rows を返さず、rowCount・encoding・headers・columns を返す", () => {
    const res = handleParseRequest({
      id: 1,
      buffer: bufferOf("name,age\nAlice,30\nBob,25\n"),
      metaOnly: true,
    });
    expect(res.ok).toBe(true);
    expect(res.result).not.toHaveProperty("rows");
    expect(res.result.rowCount).toBe(2);
    expect(res.result.encoding).toBe("utf-8");
    expect(res.result.headers).toEqual(["name", "age"]);
    expect(res.result.columns).toEqual([
      { name: "name", type: "string" },
      { name: "age", type: "number" },
    ]);
  });

  it("metaOnly でも、空ファイルは EmptyCsvError の失敗応答になる", () => {
    const res = handleParseRequest({
      id: 2,
      buffer: bufferOf(""),
      metaOnly: true,
    });
    expect(res.ok).toBe(false);
    expect(res.error.name).toBe("EmptyCsvError");
  });

  it("metaOnly を付けない通常の応答は、従来どおり rows を返す（rowCount は付けない）", () => {
    const res = handleParseRequest({ id: 3, buffer: bufferOf("a\n1\n2\n") });
    expect(res.result.rows).toEqual([{ a: "1" }, { a: "2" }]);
    expect(res.result).not.toHaveProperty("rowCount");
  });
});
