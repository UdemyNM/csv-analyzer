// 対象: src/repositories/local/LocalViewRepository.js（IndexedDB 実装）
import { describe, it, expect } from "vitest";
import { LocalAuth } from "./LocalAuth.js";
import { LocalViewRepository } from "../../../src/repositories/local/LocalViewRepository.js";
import { describeViewRepositoryContract } from "../contract/viewRepository.contract.js";
import { USERS, VIEW_CONFIG, sampleCreateInput } from "../contract/fixtures.js";
import { createLocalEnv, uniqueDbName } from "./createLocalEnv.js";

describeViewRepositoryContract("LocalViewRepository", createLocalEnv);

describe("LocalViewRepository 固有（IndexedDB 永続化・擬似ユーザー連動）", () => {
  it("同じ dbName で作り直した別インスタンスから、保存済みの view が見える", async () => {
    const dbName = uniqueDbName();
    const first = await createLocalEnv({ dbName });
    await first.auth.signIn(USERS[0].email, USERS[0].password);
    const ds = await first.datasets.create(
      sampleCreateInput({ visibility: "shared" }),
    );
    const view = await first.views.create({
      datasetId: ds.id,
      name: "persist",
      config: VIEW_CONFIG,
    });

    const auth2 = new LocalAuth({ users: USERS });
    const views2 = new LocalViewRepository({ auth: auth2, dbName });
    await auth2.signIn(USERS[1].email, USERS[1].password); // bob（shared なので見える）

    const list = await views2.listByDataset(ds.id);
    expect(list.map((v) => v.id)).toEqual([view.id]);
    expect(list[0].config).toEqual(VIEW_CONFIG);
  });

  it("ログインし直すと、作成者と権限が変わる", async () => {
    const { auth, datasets, views } = await createLocalEnv();
    await auth.signIn("alice@example.com", "alice-pass");
    const ds = await datasets.create(
      sampleCreateInput({ visibility: "shared" }),
    );
    const aliceView = await views.create({
      datasetId: ds.id,
      name: "a",
      config: {},
    });
    await auth.signIn("bob@example.com", "bob-pass");
    const bobView = await views.create({
      datasetId: ds.id,
      name: "b",
      config: {},
    });
    expect(bobView.ownerId).toBe("u-bob");
    await expect(views.update(aliceView.id, { name: "x" })).rejects.toThrow();
    await auth.signIn("alice@example.com", "alice-pass");
    await expect(views.remove(bobView.id)).rejects.toThrow();
  });

  it("別の dbName の view は見えない（DB が分離される）", async () => {
    const a = await createLocalEnv({ dbName: uniqueDbName() });
    const b = await createLocalEnv({ dbName: uniqueDbName() });
    await a.auth.signIn("alice@example.com", "alice-pass");
    const ds = await a.datasets.create(
      sampleCreateInput({ visibility: "shared" }),
    );
    await a.views.create({ datasetId: ds.id, name: "only-in-a", config: {} });
    await b.auth.signIn("alice@example.com", "alice-pass");
    expect(await b.views.listByDataset(ds.id)).toEqual([]);
  });
});
