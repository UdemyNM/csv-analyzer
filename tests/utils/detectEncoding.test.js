// @vitest-environment node
// 仕様: docs/03-functional-design.md 2.1
import { describe, it, expect } from "vitest";
import { detectEncoding } from "../../src/utils/detectEncoding.js";

const toBuffer = (bytes) => new Uint8Array(bytes).buffer;
const utf8Buffer = (text) => new Uint8Array(Buffer.from(text, "utf-8")).buffer;

// Shift_JIS のバイト列（samples/sales_excel_sjis.csv の 1 行目の先頭を抜粋）
// 店舗 = 93 58 95 DC / 商品 = 8F A4 95 69
const SJIS_HEADER = [0x93, 0x58, 0x95, 0xdc, 0x2c, 0x8f, 0xa4, 0x95, 0x69];

describe("detectEncoding", () => {
  describe("正常系", () => {
    it("BOM なしの UTF-8（日本語）は utf-8", () => {
      expect(detectEncoding(utf8Buffer("店舗,商品\n渋谷店,りんご"))).toBe(
        "utf-8",
      );
    });

    it("ASCII だけの内容は utf-8", () => {
      expect(detectEncoding(utf8Buffer("a,b\n1,2\n"))).toBe("utf-8");
    });

    it("BOM 付き UTF-8 は utf-8", () => {
      const bom = [0xef, 0xbb, 0xbf];
      const body = Array.from(Buffer.from("回答ID,店舗\n1,渋谷店", "utf-8"));
      expect(detectEncoding(toBuffer([...bom, ...body]))).toBe("utf-8");
    });

    it("Shift_JIS のバイト列は shift_jis", () => {
      expect(detectEncoding(toBuffer(SJIS_HEADER))).toBe("shift_jis");
    });

    it("Shift_JIS の日本語＋ASCII 混在（改行 CRLF）も shift_jis", () => {
      const bytes = [...SJIS_HEADER, 0x0d, 0x0a, 0x31, 0x2c, 0x32];
      expect(detectEncoding(toBuffer(bytes))).toBe("shift_jis");
    });
  });

  describe("境界値", () => {
    it("空バッファは utf-8", () => {
      expect(detectEncoding(new ArrayBuffer(0))).toBe("utf-8");
    });

    it("BOM だけ（3 バイト）でも utf-8", () => {
      expect(detectEncoding(toBuffer([0xef, 0xbb, 0xbf]))).toBe("utf-8");
    });
  });

  describe("異常系", () => {
    it("UTF-8 として不正なバイトが含まれると shift_jis（厳密デコードに失敗したとき）", () => {
      // 0x82 は UTF-8 では先頭バイトになれない
      expect(detectEncoding(toBuffer([0x61, 0x82, 0xa0]))).toBe("shift_jis");
    });
  });
});
