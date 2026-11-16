/**
 * CSV を Worker でパースする（UI を固めない。docs/01 非機能、docs/03 7 章）。
 *
 * メッセージ規約（useCsvAnalysis と共有）
 *   リクエスト: { id, buffer: ArrayBuffer, encoding?: 'utf-8' | 'shift_jis', metaOnly?: true }  encoding 省略 = 自動判定
 *   成功応答  : { id, ok: true,  result: { encoding, headers, rows, columns } }
 *               metaOnly: true のときは rows の代わりに rowCount を返す（行を複製しない。25 万行で約 0.3 秒の節約）
 *   失敗応答  : { id, ok: false, error: { name, message } }  例外は投げず、応答として返す
 */
import { detectEncoding } from "../utils/detectEncoding.js";
import { parseCsv } from "../utils/parseCsv.js";
import { inferColumnTypes } from "../utils/inferColumnTypes.js";

// jsdom と Worker で realm が違うため instanceof ではなくタグで判定する
const isArrayBuffer = (v) =>
  Object.prototype.toString.call(v) === "[object ArrayBuffer]";

/**
 * @param {{id: *, buffer: ArrayBuffer, encoding?: 'utf-8' | 'shift_jis', metaOnly?: boolean}} request
 */
export function handleParseRequest(request) {
  const id = request?.id;
  try {
    const { buffer, encoding: requested, metaOnly } = request;
    if (!isArrayBuffer(buffer)) {
      throw new TypeError("buffer（ArrayBuffer）が必要です");
    }
    const encoding = requested ?? detectEncoding(buffer);
    // TextDecoder は UTF-8 の BOM を取り除く（見出しに残らない）
    const text = new TextDecoder(encoding).decode(buffer);
    const { headers, rows } = parseCsv(text);
    const columns = inferColumnTypes(headers, rows);
    if (metaOnly === true) {
      return {
        id,
        ok: true,
        result: { encoding, headers, rowCount: rows.length, columns },
      };
    }
    return { id, ok: true, result: { encoding, headers, rows, columns } };
  } catch (e) {
    return {
      id,
      ok: false,
      error: { name: e?.name ?? "Error", message: e?.message ?? String(e) },
    };
  }
}

// Worker の中でだけメッセージの受け口を登録する（jsdom などで import しても何も起きない）
if (
  typeof WorkerGlobalScope !== "undefined" &&
  self instanceof WorkerGlobalScope
) {
  self.onmessage = (event) => {
    self.postMessage(handleParseRequest(event.data));
  };
}
