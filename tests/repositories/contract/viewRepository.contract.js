// ViewRepository 契約テスト（Local / Supabase 実装の双方が通ること）
// createEnv: () => Promise<{ auth, datasets, views, users }>  毎回まっさらな状態で返すこと
// docs/02 の RLS 方針と docs/03 3章・7章に基づく。型の詳細がない部分は本テストで次のとおり固定した:
//   - view = { id, datasetId, ownerId, name, config, createdAt, updatedAt }。config は渡した値と深く等しい
//   - listByDataset は「見える dataset の view 全部（他人が作ったものも）」を返す。
//     見えない / 存在しない dataset は、エラーにせず空配列（RLS の SELECT と同じ挙動）
//   - create: 親 dataset が見えない / 存在しないときは PermissionError か NotFoundError のどちらでも可。未ログインは PermissionError
//   - update / remove: 作成者以外（dataset の所有者を含む）は PermissionError。存在しない id は NotFoundError
//   - 親 dataset を削除すると view も消える（on delete cascade）
import { describe, it, expect, beforeEach } from "vitest";
import {
  PermissionError,
  NotFoundError,
} from "../../../src/repositories/types.js";
import {
  VIEW_CONFIG,
  sampleCreateInput,
  signInAs,
  rejectsAsDenied,
} from "./fixtures.js";

export function describeViewRepositoryContract(label, createEnv) {
  describe(`ViewRepository 契約: ${label}`, () => {
    let env;
    let shared; // alice 所有の shared dataset
    let priv; // alice 所有の private dataset

    beforeEach(async () => {
      env = await createEnv();
      await signInAs(env, "alice");
      shared = await env.datasets.create(
        sampleCreateInput({ name: "shared.csv", visibility: "shared" }),
      );
      priv = await env.datasets.create(
        sampleCreateInput({ name: "private.csv" }),
      );
    });

    const viewNames = async (datasetId) =>
      (await env.views.listByDataset(datasetId)).map((v) => v.name).sort();

    describe("create", () => {
      it("ログイン中のユーザーを作成者として作成し、view を返す", async () => {
        const v = await env.views.create({
          datasetId: shared.id,
          name: "東京だけ",
          config: VIEW_CONFIG,
        });
        expect(typeof v.id).toBe("string");
        expect(v.id.length).toBeGreaterThan(0);
        expect(v.datasetId).toBe(shared.id);
        expect(v.ownerId).toBe("u-alice");
        expect(v.name).toBe("東京だけ");
        expect(v.config).toEqual(VIEW_CONFIG);
        expect(v.createdAt).toBeTruthy();
        expect(v.updatedAt).toBeTruthy();
      });

      it("作成するたびに別の id になる", async () => {
        const a = await env.views.create({
          datasetId: shared.id,
          name: "a",
          config: {},
        });
        const b = await env.views.create({
          datasetId: shared.id,
          name: "b",
          config: {},
        });
        expect(a.id).not.toBe(b.id);
      });

      it("config（入れ子・日本語）が保存・取得でそのまま往復する", async () => {
        await env.views.create({
          datasetId: shared.id,
          name: "v",
          config: VIEW_CONFIG,
        });
        const [got] = await env.views.listByDataset(shared.id);
        expect(got.config).toEqual(VIEW_CONFIG);
      });

      it("作成後に呼び出し側が元の config を書き換えても、保存済みの内容は変わらない", async () => {
        const config = JSON.parse(JSON.stringify(VIEW_CONFIG));
        await env.views.create({ datasetId: shared.id, name: "v", config });
        config.filters.push({ column: "売上", op: "gt", value: "1" });
        config.sort.direction = "asc";
        const [got] = await env.views.listByDataset(shared.id);
        expect(got.config).toEqual(VIEW_CONFIG);
      });

      it("自分の private dataset にも作成できる", async () => {
        const v = await env.views.create({
          datasetId: priv.id,
          name: "p",
          config: {},
        });
        expect(v.datasetId).toBe(priv.id);
      });

      it("他人の shared dataset にも作成でき、作成者は自分になる", async () => {
        await signInAs(env, "bob");
        const v = await env.views.create({
          datasetId: shared.id,
          name: "bobs",
          config: {},
        });
        expect(v.ownerId).toBe("u-bob");
      });

      it("他人の private dataset には作成できない（Permission/NotFound）", async () => {
        await signInAs(env, "bob");
        await rejectsAsDenied(
          env.views.create({ datasetId: priv.id, name: "x", config: {} }),
        );
        await signInAs(env, "alice");
        expect(await env.views.listByDataset(priv.id)).toEqual([]);
      });

      it("存在しない dataset には作成できない（Permission/NotFound）", async () => {
        await rejectsAsDenied(
          env.views.create({ datasetId: "no-such-id", name: "x", config: {} }),
        );
      });

      it("未ログインでは PermissionError", async () => {
        await env.auth.signOut();
        await expect(
          env.views.create({ datasetId: shared.id, name: "x", config: {} }),
        ).rejects.toBeInstanceOf(PermissionError);
      });
    });

    describe("listByDataset", () => {
      it("view が無ければ空配列", async () => {
        expect(await env.views.listByDataset(shared.id)).toEqual([]);
      });

      it("指定した dataset の view だけを返す", async () => {
        await env.views.create({
          datasetId: shared.id,
          name: "on-shared",
          config: {},
        });
        await env.views.create({
          datasetId: priv.id,
          name: "on-private",
          config: {},
        });
        expect(await viewNames(shared.id)).toEqual(["on-shared"]);
        expect(await viewNames(priv.id)).toEqual(["on-private"]);
      });

      it("shared dataset では、他人が作った view も見える（双方向）", async () => {
        await env.views.create({
          datasetId: shared.id,
          name: "alice-view",
          config: {},
        });
        await signInAs(env, "bob");
        await env.views.create({
          datasetId: shared.id,
          name: "bob-view",
          config: {},
        });
        expect(await viewNames(shared.id)).toEqual(["alice-view", "bob-view"]);
        await signInAs(env, "alice");
        expect(await viewNames(shared.id)).toEqual(["alice-view", "bob-view"]);
      });

      it("各要素に ownerId があり、作成者を区別できる", async () => {
        await env.views.create({
          datasetId: shared.id,
          name: "alice-view",
          config: {},
        });
        await signInAs(env, "bob");
        await env.views.create({
          datasetId: shared.id,
          name: "bob-view",
          config: {},
        });
        const byName = Object.fromEntries(
          (await env.views.listByDataset(shared.id)).map((v) => [
            v.name,
            v.ownerId,
          ]),
        );
        expect(byName).toEqual({
          "alice-view": "u-alice",
          "bob-view": "u-bob",
        });
      });

      it("未ログインでは、shared dataset の view も空配列（FR-02）", async () => {
        await env.views.create({
          datasetId: shared.id,
          name: "alice-view",
          config: {},
        });
        await env.auth.signOut();
        expect(await env.views.listByDataset(shared.id)).toEqual([]);
      });

      it("親 dataset が見えない人には、view は空配列（private）", async () => {
        await env.views.create({
          datasetId: priv.id,
          name: "secret",
          config: {},
        });
        await signInAs(env, "bob");
        expect(await env.views.listByDataset(priv.id)).toEqual([]);
      });

      it("親 dataset を private に戻すと、他人からは view が見えなくなる", async () => {
        await env.views.create({
          datasetId: shared.id,
          name: "alice-view",
          config: {},
        });
        await signInAs(env, "bob");
        await env.views.create({
          datasetId: shared.id,
          name: "bob-view",
          config: {},
        });
        await signInAs(env, "alice");
        await env.datasets.update(shared.id, { visibility: "private" });

        await signInAs(env, "carol");
        expect(await env.views.listByDataset(shared.id)).toEqual([]);
        await signInAs(env, "bob");
        expect(await env.views.listByDataset(shared.id)).toEqual([]);
        // dataset の所有者には、他人が作った view も見える（親が見えるため）
        await signInAs(env, "alice");
        expect(await viewNames(shared.id)).toEqual(["alice-view", "bob-view"]);
      });

      it("存在しない dataset は空配列", async () => {
        expect(await env.views.listByDataset("no-such-id")).toEqual([]);
      });
    });

    describe("update（作成者のみ）", () => {
      let view;
      beforeEach(async () => {
        view = await env.views.create({
          datasetId: shared.id,
          name: "orig",
          config: VIEW_CONFIG,
        });
      });

      it("作成者は name と config を更新でき、結果が保存される", async () => {
        const newConfig = {
          ...VIEW_CONFIG,
          sort: { column: "売上", direction: "asc" },
        };
        const updated = await env.views.update(view.id, {
          name: "renamed",
          config: newConfig,
        });
        expect(updated.name).toBe("renamed");
        expect(updated.config).toEqual(newConfig);
        const [got] = await env.views.listByDataset(shared.id);
        expect(got.name).toBe("renamed");
        expect(got.config).toEqual(newConfig);
      });

      it("name だけの更新では config を変えない", async () => {
        await env.views.update(view.id, { name: "only-name" });
        const [got] = await env.views.listByDataset(shared.id);
        expect(got.name).toBe("only-name");
        expect(got.config).toEqual(VIEW_CONFIG);
      });

      it("config だけの更新では name を変えない", async () => {
        await env.views.update(view.id, { config: { filters: [] } });
        const [got] = await env.views.listByDataset(shared.id);
        expect(got.name).toBe("orig");
        expect(got.config).toEqual({ filters: [] });
      });

      it("datasetId と ownerId は変わらない", async () => {
        await env.views.update(view.id, { name: "x" });
        const [got] = await env.views.listByDataset(shared.id);
        expect(got.datasetId).toBe(shared.id);
        expect(got.ownerId).toBe("u-alice");
        expect(got.id).toBe(view.id);
      });

      it("他人の view は PermissionError で、内容は変わらない", async () => {
        await signInAs(env, "bob");
        await expect(
          env.views.update(view.id, { name: "hacked" }),
        ).rejects.toBeInstanceOf(PermissionError);
        await expect(
          env.views.update(view.id, { config: {} }),
        ).rejects.toBeInstanceOf(PermissionError);
        const [got] = await env.views.listByDataset(shared.id);
        expect(got.name).toBe("orig");
        expect(got.config).toEqual(VIEW_CONFIG);
      });

      it("dataset の所有者でも、他人が作った view は更新できない", async () => {
        await signInAs(env, "bob");
        const bobs = await env.views.create({
          datasetId: shared.id,
          name: "bobs",
          config: {},
        });
        await signInAs(env, "alice");
        await expect(
          env.views.update(bobs.id, { name: "taken" }),
        ).rejects.toBeInstanceOf(PermissionError);
        expect((await viewNames(shared.id)).includes("bobs")).toBe(true);
      });

      it("存在しない id は NotFoundError", async () => {
        await expect(
          env.views.update("no-such-id", { name: "x" }),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it("親 dataset を削除すると view も消え、更新は NotFoundError（cascade）", async () => {
        await env.datasets.remove(shared.id);
        await expect(
          env.views.update(view.id, { name: "x" }),
        ).rejects.toBeInstanceOf(NotFoundError);
      });
    });

    describe("remove（作成者のみ）", () => {
      let view;
      beforeEach(async () => {
        view = await env.views.create({
          datasetId: shared.id,
          name: "orig",
          config: {},
        });
      });

      it("作成者は削除でき、一覧から消える", async () => {
        await env.views.remove(view.id);
        expect(await env.views.listByDataset(shared.id)).toEqual([]);
      });

      it("他の view には影響しない", async () => {
        await env.views.create({
          datasetId: shared.id,
          name: "keep",
          config: {},
        });
        await env.views.remove(view.id);
        expect(await viewNames(shared.id)).toEqual(["keep"]);
      });

      it("他人の view は PermissionError で、削除されない", async () => {
        await signInAs(env, "bob");
        await expect(env.views.remove(view.id)).rejects.toBeInstanceOf(
          PermissionError,
        );
        expect(await viewNames(shared.id)).toEqual(["orig"]);
      });

      it("dataset の所有者でも、他人が作った view は削除できない", async () => {
        await signInAs(env, "bob");
        const bobs = await env.views.create({
          datasetId: shared.id,
          name: "bobs",
          config: {},
        });
        await signInAs(env, "alice");
        await expect(env.views.remove(bobs.id)).rejects.toBeInstanceOf(
          PermissionError,
        );
        expect((await viewNames(shared.id)).includes("bobs")).toBe(true);
      });

      it("存在しない id は NotFoundError", async () => {
        await expect(env.views.remove("no-such-id")).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });

      it("削除したあとの再削除は NotFoundError", async () => {
        await env.views.remove(view.id);
        await expect(env.views.remove(view.id)).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });

      it("親 dataset を削除すると view も消え、削除は NotFoundError（cascade）", async () => {
        await env.datasets.remove(shared.id);
        await expect(env.views.remove(view.id)).rejects.toBeInstanceOf(
          NotFoundError,
        );
      });
    });
  });
}
