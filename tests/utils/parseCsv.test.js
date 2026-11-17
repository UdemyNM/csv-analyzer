// @vitest-environment node
// 仕様: docs/03-functional-design.md 2.2
// EmptyCsvError は parseCsv.js から export される前提（仕様に明記なし。要確認）
import { describe, it, expect } from "vitest";
import {
  parseCsv,
  EmptyCsvError,
  MissingHeaderError,
} from "../../src/utils/parseCsv.js";

describe("parseCsv", () => {
  describe("正常系", () => {
    it("1 行目をヘッダー、2 行目以降を {ヘッダー名: 文字列} の行にする", () => {
      const result = parseCsv(
        "店舗,商品,数量\n渋谷店,りんご,3\n新宿店,みかん,5\n",
      );
      expect(result.headers).toEqual(["店舗", "商品", "数量"]);
      expect(result.rows).toEqual([
        { 店舗: "渋谷店", 商品: "りんご", 数量: "3" },
        { 店舗: "新宿店", 商品: "みかん", 数量: "5" },
      ]);
    });

    it("値は変換せず文字列のまま（先頭 0・カンマ付き数字を保つ）", () => {
      const { rows } = parseCsv('id,amount\n001,"1,234"\n');
      expect(rows[0]).toEqual({ id: "001", amount: "1,234" });
    });

    it("CRLF 改行でも読める", () => {
      const { headers, rows } = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
      expect(headers).toEqual(["a", "b"]);
      expect(rows).toEqual([
        { a: "1", b: "2" },
        { a: "3", b: "4" },
      ]);
    });

    it("最後の行に改行がなくても読める", () => {
      const { rows } = parseCsv("a,b\n1,2");
      expect(rows).toEqual([{ a: "1", b: "2" }]);
    });

    it("空欄のセルは空文字になる", () => {
      const { rows } = parseCsv("a,b,c\n1,,3\n,,\n");
      expect(rows).toEqual([
        { a: "1", b: "", c: "3" },
        { a: "", b: "", c: "" },
      ]);
    });

    it("1 列だけの CSV も読める", () => {
      const { headers, rows } = parseCsv("name\nA\nB\n");
      expect(headers).toEqual(["name"]);
      expect(rows).toEqual([{ name: "A" }, { name: "B" }]);
    });
  });

  describe("特別な名前の列（セキュリティ: 列名は利用者が自由に決められる）", () => {
    it("列名 __proto__ の値も、ほかの列と同じく行に入る", () => {
      const { headers, rows } = parseCsv("__proto__,name\n100,alice\n");
      expect(headers).toEqual(["__proto__", "name"]);
      expect(Object.hasOwn(rows[0], "__proto__")).toBe(true);
      expect(rows[0]["__proto__"]).toBe("100");
      expect(rows[0].name).toBe("alice");
    });

    it("列名 __proto__ があっても、Object.prototype は汚染されない", () => {
      parseCsv("__proto__,polluted\n{},yes\n");
      expect({}.polluted).toBeUndefined();
    });

    it("toString・constructor などの名前の列は、継承した値と混ざらない", () => {
      const { rows } = parseCsv("toString,constructor,id\n,x,1\n");
      expect(rows[0].toString).toBe("");
      expect(rows[0].constructor).toBe("x");
      // 存在しない列名を読むと、継承したメソッドではなく undefined になる
      expect(rows[0].hasOwnProperty).toBeUndefined();
    });
  });

  describe("クォート・改行・カンマ", () => {
    it("引用符の中のカンマはセルの区切りにならない", () => {
      const { rows } = parseCsv('a,b\n"x,y",z\n');
      expect(rows).toEqual([{ a: "x,y", b: "z" }]);
    });

    it("引用符の中の改行（LF）はセルの一部", () => {
      const { rows } = parseCsv('id,comment\n1,"1行目\n2行目"\n2,ok\n');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ id: "1", comment: "1行目\n2行目" });
      expect(rows[1]).toEqual({ id: "2", comment: "ok" });
    });

    it("引用符の中の改行（CRLF）もセルの一部で、行がずれない", () => {
      const { rows } = parseCsv('id,comment\r\n1,"a\r\nb"\r\n2,c\r\n');
      expect(rows).toHaveLength(2);
      expect(rows[0].comment).toBe("a\r\nb");
      expect(rows[1]).toEqual({ id: "2", comment: "c" });
    });

    it('二重引用符 "" は 1 つの " として読む', () => {
      const { rows } = parseCsv('a\n"彼は""はい""と言った"\n');
      expect(rows).toEqual([{ a: '彼は"はい"と言った' }]);
    });

    it("改行・カンマ・二重引用符が全部入ったセルでも列がずれない（survey.csv の感想の形）", () => {
      const text =
        '回答ID,感想,再来店\n1,"駐車場が狭い。\nでも、""品揃え""は良い",はい\n2,,いいえ\n';
      const { headers, rows } = parseCsv(text);
      expect(headers).toEqual(["回答ID", "感想", "再来店"]);
      expect(rows).toEqual([
        {
          回答ID: "1",
          感想: '駐車場が狭い。\nでも、"品揃え"は良い',
          再来店: "はい",
        },
        { 回答ID: "2", 感想: "", 再来店: "いいえ" },
      ]);
    });

    it("区切りはカンマ固定。セルの中の ; やタブがあっても区切り文字の自動判定でずれない", () => {
      const { headers, rows } = parseCsv(
        "id,items\n1,りんご;みかん\n2,みかん;バナナ;いちご\n",
      );
      expect(headers).toEqual(["id", "items"]);
      expect(rows).toEqual([
        { id: "1", items: "りんご;みかん" },
        { id: "2", items: "みかん;バナナ;いちご" },
      ]);
      const tabbed = parseCsv("id,memo\n1,a\tb\n2,c\td\n");
      expect(tabbed.headers).toEqual(["id", "memo"]);
      expect(tabbed.rows).toEqual([
        { id: "1", memo: "a\tb" },
        { id: "2", memo: "c\td" },
      ]);
    });
  });

  describe("末尾の空行", () => {
    it("末尾に空行が 1 つあっても行として数えない", () => {
      expect(parseCsv("a,b\n1,2\n\n").rows).toHaveLength(1);
    });

    it("末尾に空行が複数あっても行として数えない（CRLF も同様）", () => {
      expect(parseCsv("a,b\n1,2\n\n\n\n").rows).toEqual([{ a: "1", b: "2" }]);
      expect(parseCsv("a,b\r\n1,2\r\n\r\n\r\n").rows).toEqual([
        { a: "1", b: "2" },
      ]);
    });
  });

  describe("ヘッダーの一意化", () => {
    it("重複したヘッダーは name, name_2 のように連番にする", () => {
      const { headers, rows } = parseCsv("name,name\nA,B\n");
      expect(headers).toEqual(["name", "name_2"]);
      expect(rows).toEqual([{ name: "A", name_2: "B" }]);
    });

    it("3 つ重複すると name, name_2, name_3", () => {
      const { headers, rows } = parseCsv("name,x,name,name\n1,2,3,4\n");
      expect(headers).toEqual(["name", "x", "name_2", "name_3"]);
      expect(rows[0]).toEqual({ name: "1", x: "2", name_2: "3", name_3: "4" });
    });
  });

  describe("境界値", () => {
    it("ヘッダーのみ（データ 0 行）は rows=[] で成功", () => {
      expect(parseCsv("a,b,c")).toEqual({ headers: ["a", "b", "c"], rows: [] });
    });

    it("ヘッダー＋改行のみ（データ 0 行）も rows=[] で成功", () => {
      expect(parseCsv("a,b,c\n")).toEqual({
        headers: ["a", "b", "c"],
        rows: [],
      });
      expect(parseCsv("a,b,c\r\n")).toEqual({
        headers: ["a", "b", "c"],
        rows: [],
      });
    });

    it("列数が足りない行は不足分を空文字で補う", () => {
      const { rows } = parseCsv("a,b,c\n1,2\n4\n");
      expect(rows).toEqual([
        { a: "1", b: "2", c: "" },
        { a: "4", b: "", c: "" },
      ]);
    });

    it("行オブジェクトのキーはヘッダーの並び順", () => {
      const { rows } = parseCsv("z,a,m\n1,2,3\n");
      expect(Object.keys(rows[0])).toEqual(["z", "a", "m"]);
    });
  });

  describe("異常系", () => {
    it("空文字列は EmptyCsvError", () => {
      expect(() => parseCsv("")).toThrow(EmptyCsvError);
    });

    it("EmptyCsvError は Error を継承する", () => {
      expect(new EmptyCsvError()).toBeInstanceOf(Error);
    });

    // FR-15「ヘッダーなし」: 1 行目の列名がすべて空欄なら、ヘッダーがないものとして扱う
    it("1 行目がすべて空欄（,,）なら MissingHeaderError", () => {
      expect(() => parseCsv(",,\n1,2,3\n")).toThrow(MissingHeaderError);
    });

    it("1 行目が空白だけでも MissingHeaderError", () => {
      expect(() => parseCsv("  \n1,2\n")).toThrow(MissingHeaderError);
      expect(() => parseCsv(" , \n1,2\n")).toThrow(MissingHeaderError);
    });

    it("ヘッダーの一部が空欄なだけなら成功する（連番の索引列など）", () => {
      const { headers, rows } = parseCsv(",a\n1,2\n");
      expect(headers).toEqual(["", "a"]);
      expect(rows).toEqual([{ "": "1", a: "2" }]);
    });

    it("MissingHeaderError は Error を継承し、name で見分けられる（Worker 経由でも name が残る）", () => {
      const e = new MissingHeaderError();
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe("MissingHeaderError");
      expect(e.message).toMatch(/ヘッダー/);
    });
  });
});
