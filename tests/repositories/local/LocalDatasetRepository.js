/**
 * DatasetRepository の IndexedDB 実装。
 * 現在のユーザーは auth.getCurrentUser() から取る。
 * 注意: File / Blob はそのまま保存すると構造化複製で壊れる環境があるため、ArrayBuffer にして保存する。
 */
import { NotFoundError, PermissionError } from "../../../src/repositories/types.js";
import {
  DATASETS,
  FILES,
  VIEWS,
  assertOwner,
  canSee,
  getVisibleDataset,
  idbRequest,
  newId,
  nowIso,
  openLocalDb,
  runTransaction,
} from "./localDb.js";

const VISIBILITIES = ["private", "shared"];

function assertVisibility(visibility) {
  if (!VISIBILITIES.includes(visibility)) {
    throw new RangeError(
      `visibility は ${VISIBILITIES.join(" / ")} のどちらかです: ${String(visibility)}`,
    );
  }
}

export class LocalDatasetRepository {
  #auth;
  #dbName;

  /** @param {{auth: {getCurrentUser: () => Promise<object | null>}, dbName: string}} options */
  constructor({ auth, dbName }) {
    this.#auth = auth;
    this.#dbName = dbName;
  }

  async list() {
    const [me, db] = await this.#context();
    const all = await runTransaction(db, [DATASETS], "readonly", (tx) =>
      idbRequest(tx.objectStore(DATASETS).getAll()),
    );
    return all
      .filter((d) => canSee(d, me))
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
      );
  }

  async get(id) {
    const [me, db] = await this.#context();
    return runTransaction(db, [DATASETS], "readonly", (tx) =>
      getVisibleDataset(tx, id, me),
    );
  }

  async create({ name, visibility, file, meta }) {
    const [me, db] = await this.#context();
    if (me === null) {
      throw new PermissionError("ログインが必要です");
    }
    assertVisibility(visibility);
    if (typeof file?.arrayBuffer !== "function") {
      throw new TypeError("file（CSV ファイル）が必要です");
    }
    // トランザクションの外で読む（途中で IndexedDB 以外を待つとトランザクションが閉じる）
    const buffer = await file.arrayBuffer();
    const now = nowIso();
    const dataset = {
      id: newId(),
      ownerId: me.id,
      name,
      visibility,
      meta: structuredClone(meta),
      fileSize: buffer.byteLength,
      createdAt: now,
      updatedAt: now,
    };
    await runTransaction(db, [DATASETS, FILES], "readwrite", async (tx) => {
      tx.objectStore(DATASETS).add(dataset);
      tx.objectStore(FILES).add({ id: dataset.id, buffer });
    });
    return dataset;
  }

  async update(id, { name, visibility } = {}) {
    const [me, db] = await this.#context();
    if (visibility !== undefined) assertVisibility(visibility);
    return runTransaction(db, [DATASETS], "readwrite", async (tx) => {
      const dataset = await getVisibleDataset(tx, id, me);
      assertOwner(dataset, me, "作成者のみ更新できます");
      const updated = { ...dataset, updatedAt: nowIso() };
      if (name !== undefined) updated.name = name;
      if (visibility !== undefined) updated.visibility = visibility;
      tx.objectStore(DATASETS).put(updated);
      return updated;
    });
  }

  async remove(id) {
    const [me, db] = await this.#context();
    await runTransaction(
      db,
      [DATASETS, FILES, VIEWS],
      "readwrite",
      async (tx) => {
        const dataset = await getVisibleDataset(tx, id, me);
        assertOwner(dataset, me, "作成者のみ削除できます");
        tx.objectStore(DATASETS).delete(id);
        tx.objectStore(FILES).delete(id);
        // 親 dataset を消したら view も消す（cascade）
        const viewStore = tx.objectStore(VIEWS);
        const viewIds = await idbRequest(
          viewStore.index("datasetId").getAllKeys(id),
        );
        for (const viewId of viewIds) viewStore.delete(viewId);
      },
    );
  }

  async downloadCsv(id) {
    const [me, db] = await this.#context();
    return runTransaction(db, [DATASETS, FILES], "readonly", async (tx) => {
      await getVisibleDataset(tx, id, me);
      const file = await idbRequest(tx.objectStore(FILES).get(id));
      if (!file) throw new NotFoundError("見つかりません");
      return file.buffer;
    });
  }

  async #context() {
    return Promise.all([
      this.#auth.getCurrentUser(),
      openLocalDb(this.#dbName),
    ]);
  }
}
