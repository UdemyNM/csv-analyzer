// 対象: src/repositories/supabase/SupabaseDatasetRepository.js（DatasetRepository の Supabase 実装）
// 仕様: docs/02 3 章（datasets・Storage の RLS）、src/repositories/types.js の DatasetRepository
// 契約（Local と共通の契約テストに加えて）:
//   - CSV 原本は private バケット csv-files の {作成者id}/{dataset id}.csv に、contentType text/csv で置く
//   - 行の作成に失敗したら、置いた原本を消す（孤児ファイルを残さない）
//   - 削除すると原本も消える
//   - uuid でない id は、問い合わせずに NotFoundError（Postgres の型エラーを画面に出さない）
//   - 通信・DB の失敗は、内部のメッセージを出さずに日本語のエラーにする
import { describe, it, expect } from "vitest";
import { describeDatasetRepositoryContract } from "../contract/datasetRepository.contract.js";
import { NotFoundError } from "../../../src/repositories/types.js";
import { sampleCreateInput, signInAs } from "../contract/fixtures.js";
import { createSupabaseEnv } from "./createSupabaseEnv.js";

describeDatasetRepositoryContract(
  "SupabaseDatasetRepository（偽クライアント）",
  createSupabaseEnv,
);

describe("SupabaseDatasetRepository 固有（Storage と DB の整合）", () => {
  it("原本を csv-files/{作成者id}/{id}.csv に置く", async () => {
    const env = await createSupabaseEnv();
    await signInAs(env, "alice");
    const d = await env.datasets.create(sampleCreateInput());
    expect(env.client.__inspect.objectPaths()).toEqual([`u-alice/${d.id}.csv`]);
  });

  it("行の作成に失敗したら、置いた原本を消してエラーにする", async () => {
    const env = await createSupabaseEnv({
      failNext: { table: "datasets", op: "insert" },
    });
    await signInAs(env, "alice");
    await expect(env.datasets.create(sampleCreateInput())).rejects.toThrow(
      /保存できませんでした/,
    );
    expect(env.client.__inspect.objectPaths()).toEqual([]);
    expect(await env.datasets.list()).toEqual([]);
  });

  it("削除すると原本も消える", async () => {
    const env = await createSupabaseEnv();
    await signInAs(env, "alice");
    const d = await env.datasets.create(sampleCreateInput());
    await env.datasets.remove(d.id);
    expect(env.client.__inspect.objectPaths()).toEqual([]);
  });

  it("他人が削除しようとしても、原本は残る", async () => {
    const env = await createSupabaseEnv();
    await signInAs(env, "alice");
    const d = await env.datasets.create(
      sampleCreateInput({ visibility: "shared" }),
    );
    await signInAs(env, "bob");
    await expect(env.datasets.remove(d.id)).rejects.toThrow();
    expect(env.client.__inspect.objectPaths()).toEqual([`u-alice/${d.id}.csv`]);
  });

  it("uuid でない id は NotFoundError（型エラーの文言を出さない）", async () => {
    const env = await createSupabaseEnv();
    await signInAs(env, "alice");
    for (const call of [
      () => env.datasets.get("abc"),
      () => env.datasets.update("abc", { name: "x" }),
      () => env.datasets.remove("abc"),
      () => env.datasets.downloadCsv("abc"),
    ]) {
      await expect(call()).rejects.toBeInstanceOf(NotFoundError);
    }
  });

  it("一覧の取得に失敗したら、内部のメッセージを出さずにエラーにする", async () => {
    const env = await createSupabaseEnv({
      failNext: { table: "datasets", op: "select" },
    });
    await signInAs(env, "alice");
    const error = await env.datasets.list().catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/取得できませんでした/);
    expect(error.message).not.toMatch(/simulated/);
  });

  it("一覧は新しい順", async () => {
    const env = await createSupabaseEnv();
    await signInAs(env, "alice");
    await env.datasets.create(sampleCreateInput({ name: "old" }));
    await env.datasets.create(sampleCreateInput({ name: "new" }));
    expect((await env.datasets.list()).map((d) => d.name)).toEqual([
      "new",
      "old",
    ]);
  });
});
