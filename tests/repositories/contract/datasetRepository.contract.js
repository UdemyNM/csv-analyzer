// DatasetRepository 契約テスト（Local / Supabase 実装の双方が通ること）
// createEnv: () => Promise<{ auth, datasets, views, users }>  毎回まっさらな状態で返すこと
// docs/03 3章・4章・7章に基づく。仕様に型の詳細がない部分は本テストで次のとおり固定した:
//   - dataset = { id, ownerId, name, visibility, meta, fileSize, createdAt, updatedAt }
//   - create の file は File。meta は渡した値をそのまま保持する
//   - 見えない / 存在しない dataset の get・downloadCsv・update・remove は NotFoundError
//   - 他人の「見える」dataset（shared）の update / remove は PermissionError
//   - 他人の private への update / remove は PermissionError か NotFoundError のどちらでも可
import { describe, it, expect, beforeEach } from "vitest";
import {
  PermissionError,
  NotFoundError,
} from "../../../src/repositories/types.js";
import {
  META,
  SHIFT_JIS_BYTES,
  CSV_TEXT,
  makeCsvFile,
  sampleCreateInput,
  signInAs,
  toBytes,
  utf8Bytes,
  isArrayBuffer,
  rejectsAsDenied,
} from "./fixtures.js";

export function describeDatasetRepositoryContract(label, createEnv) {
  describe(`DatasetRepository 契約: ${label}`, () => {
    let env;
    beforeEach(async () => {
      env = await createEnv();
    });

    const names = async () =>
      (await env.datasets.list()).map((d) => d.name).sort();
    const csvBytes = () => toBytes(utf8Bytes(CSV_TEXT).buffer);

    describe("create", () => {
      it("ログイン中のユーザーを作成者として作成し、dataset を返す", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(sampleCreateInput());
        expect(typeof d.id).toBe("string");
        expect(d.id.length).toBeGreaterThan(0);
        expect(d.ownerId).toBe("u-alice");
        expect(d.name).toBe("sales.csv");
        expect(d.visibility).toBe("private");
        expect(d.meta).toEqual(META);
        expect(d.fileSize).toBe(utf8Bytes(CSV_TEXT).byteLength);
        expect(d.createdAt).toBeTruthy();
        expect(d.updatedAt).toBeTruthy();
      });

      it("visibility に shared を指定できる", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(
          sampleCreateInput({ visibility: "shared" }),
        );
        expect(d.visibility).toBe("shared");
      });

      it("作成するたびに別の id になる", async () => {
        await signInAs(env, "alice");
        const a = await env.datasets.create(sampleCreateInput());
        const b = await env.datasets.create(sampleCreateInput());
        expect(a.id).not.toBe(b.id);
      });

      it("作成したものを get で取得できる", async () => {
        await signInAs(env, "alice");
        const created = await env.datasets.create(sampleCreateInput());
        const got = await env.datasets.get(created.id);
        expect(got.id).toBe(created.id);
        expect(got.name).toBe("sales.csv");
        expect(got.meta).toEqual(META);
      });

      it("visibility が private / shared 以外なら拒否する", async () => {
        await signInAs(env, "alice");
        await expect(
          env.datasets.create(sampleCreateInput({ visibility: "public" })),
        ).rejects.toThrow();
        expect(await env.datasets.list()).toHaveLength(0);
      });

      it("file が無ければ拒否する", async () => {
        await signInAs(env, "alice");
        await expect(
          env.datasets.create(sampleCreateInput({ file: undefined })),
        ).rejects.toThrow();
        expect(await env.datasets.list()).toHaveLength(0);
      });

      it("未ログインでは PermissionError", async () => {
        await expect(
          env.datasets.create(sampleCreateInput()),
        ).rejects.toBeInstanceOf(PermissionError);
      });
    });

    describe("list（閲覧可能なものだけ返す）", () => {
      it("何も無ければ空配列", async () => {
        await signInAs(env, "alice");
        expect(await env.datasets.list()).toEqual([]);
      });

      it("自分の private / shared をどちらも返す", async () => {
        await signInAs(env, "alice");
        await env.datasets.create(sampleCreateInput({ name: "mine-private" }));
        await env.datasets.create(
          sampleCreateInput({ name: "mine-shared", visibility: "shared" }),
        );
        expect(await names()).toEqual(["mine-private", "mine-shared"]);
      });

      it("他人の shared は返し、他人の private は返さない", async () => {
        await signInAs(env, "alice");
        await env.datasets.create(sampleCreateInput({ name: "a-private" }));
        await env.datasets.create(
          sampleCreateInput({ name: "a-shared", visibility: "shared" }),
        );
        await signInAs(env, "bob");
        await env.datasets.create(sampleCreateInput({ name: "b-private" }));
        expect(await names()).toEqual(["a-shared", "b-private"]);
      });

      it("ユーザーを切り替えると、見える一覧も切り替わる", async () => {
        await signInAs(env, "alice");
        await env.datasets.create(sampleCreateInput({ name: "a-private" }));
        await signInAs(env, "bob");
        expect(await names()).toEqual([]);
        await signInAs(env, "alice");
        expect(await names()).toEqual(["a-private"]);
      });

      it("作成者が shared を private に戻すと、他人の一覧から消える", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(
          sampleCreateInput({ name: "a", visibility: "shared" }),
        );
        await signInAs(env, "bob");
        expect(await names()).toEqual(["a"]);
        await signInAs(env, "alice");
        await env.datasets.update(d.id, { visibility: "private" });
        await signInAs(env, "bob");
        expect(await names()).toEqual([]);
      });

      it("private を shared にすると、他人の一覧に現れる", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(sampleCreateInput({ name: "a" }));
        await signInAs(env, "carol");
        expect(await names()).toEqual([]);
        await signInAs(env, "alice");
        await env.datasets.update(d.id, { visibility: "shared" });
        await signInAs(env, "carol");
        expect(await names()).toEqual(["a"]);
      });

      it("各要素に id と ownerId が含まれる", async () => {
        await signInAs(env, "alice");
        await env.datasets.create(sampleCreateInput());
        const [d] = await env.datasets.list();
        expect(typeof d.id).toBe("string");
        expect(d.ownerId).toBe("u-alice");
      });
    });

    describe("未ログイン（FR-02: 一覧・閲覧にアクセスできない）", () => {
      // 画面だけに頼らず、保存層でも拒否する（docs/01 非機能「権限判定はサーバー側」。RLS は authenticated のみ）
      it("shared があっても list は空配列", async () => {
        await signInAs(env, "alice");
        await env.datasets.create(
          sampleCreateInput({ name: "a-shared", visibility: "shared" }),
        );
        await env.auth.signOut();
        expect(await env.datasets.list()).toEqual([]);
      });

      it("shared の get / downloadCsv は NotFoundError", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(
          sampleCreateInput({ visibility: "shared" }),
        );
        await env.auth.signOut();
        await expect(env.datasets.get(d.id)).rejects.toBeInstanceOf(
          NotFoundError,
        );
        await expect(env.datasets.downloadCsv(d.id)).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });

      it("ログインし直せば、また見える", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(
          sampleCreateInput({ visibility: "shared" }),
        );
        await env.auth.signOut();
        await signInAs(env, "bob");
        expect((await env.datasets.get(d.id)).id).toBe(d.id);
      });
    });

    describe("get", () => {
      it("自分の private を取得できる", async () => {
        await signInAs(env, "alice");
        const created = await env.datasets.create(sampleCreateInput());
        expect((await env.datasets.get(created.id)).id).toBe(created.id);
      });

      it("他人の shared を取得できる", async () => {
        await signInAs(env, "alice");
        const created = await env.datasets.create(
          sampleCreateInput({ visibility: "shared" }),
        );
        await signInAs(env, "bob");
        const got = await env.datasets.get(created.id);
        expect(got.id).toBe(created.id);
        expect(got.ownerId).toBe("u-alice");
      });

      it("他人の private は NotFoundError（URL直打ちは「見つかりません」）", async () => {
        await signInAs(env, "alice");
        const created = await env.datasets.create(sampleCreateInput());
        await signInAs(env, "bob");
        await expect(env.datasets.get(created.id)).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });

      it("存在しない id は NotFoundError", async () => {
        await signInAs(env, "alice");
        await expect(env.datasets.get("no-such-id")).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });
    });

    describe("update（作成者のみ）", () => {
      it("作成者は name を変更できる", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(
          sampleCreateInput({ name: "old.csv" }),
        );
        const updated = await env.datasets.update(d.id, { name: "new.csv" });
        expect(updated.name).toBe("new.csv");
        expect((await env.datasets.get(d.id)).name).toBe("new.csv");
      });

      it("作成者は visibility を変更でき、他の項目は変わらない", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(
          sampleCreateInput({ name: "x.csv" }),
        );
        await env.datasets.update(d.id, { visibility: "shared" });
        const got = await env.datasets.get(d.id);
        expect(got.visibility).toBe("shared");
        expect(got.name).toBe("x.csv");
        expect(got.ownerId).toBe("u-alice");
        expect(got.meta).toEqual(META);
      });

      it("name と visibility を同時に変更できる", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(sampleCreateInput());
        await env.datasets.update(d.id, {
          name: "both.csv",
          visibility: "shared",
        });
        const got = await env.datasets.get(d.id);
        expect(got.name).toBe("both.csv");
        expect(got.visibility).toBe("shared");
      });

      it("他人の shared は PermissionError で、内容は変わらない", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(
          sampleCreateInput({ name: "orig.csv", visibility: "shared" }),
        );
        await signInAs(env, "bob");
        await expect(
          env.datasets.update(d.id, { name: "hacked" }),
        ).rejects.toBeInstanceOf(PermissionError);
        await expect(
          env.datasets.update(d.id, { visibility: "private" }),
        ).rejects.toBeInstanceOf(PermissionError);
        await signInAs(env, "alice");
        const got = await env.datasets.get(d.id);
        expect(got.name).toBe("orig.csv");
        expect(got.visibility).toBe("shared");
      });

      it("他人の private への更新は拒否され（Permission/NotFound）、内容は変わらない", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(
          sampleCreateInput({ name: "orig.csv" }),
        );
        await signInAs(env, "bob");
        await rejectsAsDenied(env.datasets.update(d.id, { name: "hacked" }));
        await rejectsAsDenied(
          env.datasets.update(d.id, { visibility: "shared" }),
        );
        await signInAs(env, "alice");
        const got = await env.datasets.get(d.id);
        expect(got.name).toBe("orig.csv");
        expect(got.visibility).toBe("private");
      });

      it("存在しない id は NotFoundError", async () => {
        await signInAs(env, "alice");
        await expect(
          env.datasets.update("no-such-id", { name: "x" }),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it("不正な visibility は拒否され、元の値のまま", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(sampleCreateInput());
        await expect(
          env.datasets.update(d.id, { visibility: "public" }),
        ).rejects.toThrow();
        expect((await env.datasets.get(d.id)).visibility).toBe("private");
      });

      it("未ログインでは更新できない", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(
          sampleCreateInput({ visibility: "shared" }),
        );
        await env.auth.signOut();
        await expect(
          env.datasets.update(d.id, { name: "x" }),
        ).rejects.toThrow();
      });
    });

    describe("remove（作成者のみ）", () => {
      it("作成者は削除でき、get / list から消える", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(
          sampleCreateInput({ name: "del.csv" }),
        );
        await env.datasets.remove(d.id);
        await expect(env.datasets.get(d.id)).rejects.toBeInstanceOf(
          NotFoundError,
        );
        expect(await env.datasets.list()).toEqual([]);
      });

      it("削除した dataset の CSV 原本も取得できなくなる", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(sampleCreateInput());
        await env.datasets.remove(d.id);
        await expect(env.datasets.downloadCsv(d.id)).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });

      it("他の dataset には影響しない", async () => {
        await signInAs(env, "alice");
        const a = await env.datasets.create(
          sampleCreateInput({ name: "a.csv" }),
        );
        await env.datasets.create(sampleCreateInput({ name: "b.csv" }));
        await env.datasets.remove(a.id);
        expect(await names()).toEqual(["b.csv"]);
      });

      it("他人の shared は PermissionError で、削除されない", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(
          sampleCreateInput({ visibility: "shared" }),
        );
        await signInAs(env, "bob");
        await expect(env.datasets.remove(d.id)).rejects.toBeInstanceOf(
          PermissionError,
        );
        expect((await env.datasets.get(d.id)).id).toBe(d.id);
      });

      it("他人の private の削除は拒否され（Permission/NotFound）、残る", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(sampleCreateInput());
        await signInAs(env, "bob");
        await rejectsAsDenied(env.datasets.remove(d.id));
        await signInAs(env, "alice");
        expect((await env.datasets.get(d.id)).id).toBe(d.id);
      });

      it("存在しない id は NotFoundError", async () => {
        await signInAs(env, "alice");
        await expect(env.datasets.remove("no-such-id")).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });

      it("削除したあとの再削除は NotFoundError", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(sampleCreateInput());
        await env.datasets.remove(d.id);
        await expect(env.datasets.remove(d.id)).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });
    });

    describe("downloadCsv", () => {
      it("作成時の原本を ArrayBuffer で、バイト列そのまま返す（UTF-8）", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(sampleCreateInput());
        const buf = await env.datasets.downloadCsv(d.id);
        expect(isArrayBuffer(buf)).toBe(true);
        expect(toBytes(buf)).toEqual(csvBytes());
      });

      it("Shift_JIS のバイト列も変換せずそのまま返す", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(
          sampleCreateInput({ file: makeCsvFile(SHIFT_JIS_BYTES, "sjis.csv") }),
        );
        const buf = await env.datasets.downloadCsv(d.id);
        expect(toBytes(buf)).toEqual(Array.from(SHIFT_JIS_BYTES));
      });

      it("他人の shared は取得できる", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(
          sampleCreateInput({ visibility: "shared" }),
        );
        await signInAs(env, "bob");
        const buf = await env.datasets.downloadCsv(d.id);
        expect(toBytes(buf)).toEqual(csvBytes());
      });

      it("他人の private は NotFoundError", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(sampleCreateInput());
        await signInAs(env, "bob");
        await expect(env.datasets.downloadCsv(d.id)).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });

      it("shared を private に戻すと、他人は取得できなくなる", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(
          sampleCreateInput({ visibility: "shared" }),
        );
        await env.datasets.update(d.id, { visibility: "private" });
        await signInAs(env, "bob");
        await expect(env.datasets.downloadCsv(d.id)).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });

      it("存在しない id は NotFoundError", async () => {
        await signInAs(env, "alice");
        await expect(
          env.datasets.downloadCsv("no-such-id"),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it("名前を変更しても原本は変わらない", async () => {
        await signInAs(env, "alice");
        const d = await env.datasets.create(sampleCreateInput());
        await env.datasets.update(d.id, { name: "renamed.csv" });
        const buf = await env.datasets.downloadCsv(d.id);
        expect(toBytes(buf)).toEqual(csvBytes());
      });
    });
  });
}
