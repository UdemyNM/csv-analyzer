// 対象: src/repositories/supabase/SupabaseViewRepository.js（ViewRepository の Supabase 実装）
// 仕様: docs/02 3 章（views の RLS）、src/repositories/types.js の ViewRepository
// 契約（Local と共通の契約テストに加えて）:
//   - uuid でない id・datasetId は、問い合わせずに 空配列 / NotFoundError
//   - 一覧は作成順（古い順）
import { describe, it, expect } from "vitest";
import { describeViewRepositoryContract } from "../contract/viewRepository.contract.js";
import { NotFoundError } from "../../../src/repositories/types.js";
import { sampleCreateInput, signInAs } from "../contract/fixtures.js";
import { createSupabaseEnv } from "./createSupabaseEnv.js";

describeViewRepositoryContract(
  "SupabaseViewRepository（偽クライアント）",
  createSupabaseEnv,
);

describe("SupabaseViewRepository 固有", () => {
  it("uuid でない id・datasetId は 空配列 / NotFoundError", async () => {
    const env = await createSupabaseEnv();
    await signInAs(env, "alice");
    expect(await env.views.listByDataset("abc")).toEqual([]);
    await expect(
      env.views.create({ datasetId: "abc", name: "x", config: {} }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(env.views.update("abc", { name: "x" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(env.views.remove("abc")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("一覧は作成順（古い順）", async () => {
    const env = await createSupabaseEnv();
    await signInAs(env, "alice");
    const d = await env.datasets.create(sampleCreateInput());
    await env.views.create({ datasetId: d.id, name: "first", config: {} });
    await env.views.create({ datasetId: d.id, name: "second", config: {} });
    expect((await env.views.listByDataset(d.id)).map((v) => v.name)).toEqual([
      "first",
      "second",
    ]);
  });
});
