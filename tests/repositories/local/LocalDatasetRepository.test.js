// 対象: src/repositories/local/LocalDatasetRepository.js（IndexedDB 実装）
// 備考: fake-indexeddb は File/Blob を構造化複製すると普通のオブジェクトにしてしまうため、
//       実装は保存前に ArrayBuffer へ変換する必要がある（契約テストの downloadCsv で検出される）
import { describe, it, expect } from "vitest";
import { LocalAuth } from "./LocalAuth.js";
import { LocalDatasetRepository } from "../../../src/repositories/local/LocalDatasetRepository.js";
import { describeDatasetRepositoryContract } from "../contract/datasetRepository.contract.js";
import {
  USERS,
  CSV_TEXT,
  META,
  sampleCreateInput,
  toBytes,
  utf8Bytes,
} from "../contract/fixtures.js";
import { createLocalEnv, uniqueDbName } from "./createLocalEnv.js";

describeDatasetRepositoryContract("LocalDatasetRepository", createLocalEnv);

describe("LocalDatasetRepository 固有（IndexedDB 永続化・ログイン中のユーザーに連動）", () => {
  it("同じ dbName で作り直した別インスタンスから、保存済みの dataset と原本が見える", async () => {
    const dbName = uniqueDbName();
    const first = await createLocalEnv({ dbName });
    await first.auth.signIn(USERS[0].email, USERS[0].password);
    const created = await first.datasets.create(
      sampleCreateInput({ name: "persist.csv" }),
    );

    const auth2 = new LocalAuth({ users: USERS });
    const repo2 = new LocalDatasetRepository({ auth: auth2, dbName });
    await auth2.signIn(USERS[0].email, USERS[0].password);

    const list = await repo2.list();
    expect(list.map((d) => d.id)).toEqual([created.id]);
    expect((await repo2.get(created.id)).meta).toEqual(META);
    expect(toBytes(await repo2.downloadCsv(created.id))).toEqual(
      toBytes(utf8Bytes(CSV_TEXT).buffer),
    );
  });

  it("別の dbName のデータは見えない（DB が分離される）", async () => {
    const a = await createLocalEnv({ dbName: uniqueDbName() });
    const b = await createLocalEnv({ dbName: uniqueDbName() });
    await a.auth.signIn(USERS[0].email, USERS[0].password);
    await b.auth.signIn(USERS[0].email, USERS[0].password);
    await a.datasets.create(sampleCreateInput({ name: "only-in-a.csv" }));
    expect(await b.datasets.list()).toEqual([]);
  });

  it("永続化したあと、別インスタンスで shared を private に戻した結果も反映される", async () => {
    const dbName = uniqueDbName();
    const first = await createLocalEnv({ dbName });
    await first.auth.signIn(USERS[0].email, USERS[0].password);
    const created = await first.datasets.create(
      sampleCreateInput({ visibility: "shared" }),
    );

    const auth2 = new LocalAuth({ users: USERS });
    const repo2 = new LocalDatasetRepository({ auth: auth2, dbName });
    await auth2.signIn(USERS[0].email, USERS[0].password);
    await repo2.update(created.id, { visibility: "private" });

    expect((await first.datasets.get(created.id)).visibility).toBe("private");
  });

  it("ログインし直すと、作成者と見える範囲が変わる", async () => {
    const { auth, datasets } = await createLocalEnv();
    await auth.signIn("alice@example.com", "alice-pass");
    await datasets.create(sampleCreateInput({ name: "a-private" }));
    await auth.signIn("bob@example.com", "bob-pass");
    const own = await datasets.create(sampleCreateInput({ name: "b-private" }));
    expect(own.ownerId).toBe("u-bob");
    expect((await datasets.list()).map((d) => d.name)).toEqual(["b-private"]);
  });

  it("ログアウトした状態では private を取得できない", async () => {
    const { auth, datasets } = await createLocalEnv();
    await auth.signIn("alice@example.com", "alice-pass");
    const d = await datasets.create(sampleCreateInput());
    await auth.signOut();
    await expect(datasets.get(d.id)).rejects.toThrow();
  });
});
