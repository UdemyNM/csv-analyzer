/**
 * ViewRepository の IndexedDB 実装。
 * view は親 dataset が見える人だけが見られる。update / remove は作成者のみ。
 * 親 dataset の削除による cascade は LocalDatasetRepository.remove が行う。
 */
import { NotFoundError, PermissionError } from "../types.js";
import {
  DATASETS,
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

export class LocalViewRepository {
  #auth;
  #dbName;

  /** @param {{auth: {getCurrentUser: () => Promise<object | null>}, dbName: string}} options */
  constructor({ auth, dbName }) {
    this.#auth = auth;
    this.#dbName = dbName;
  }

  async listByDataset(datasetId) {
    const [me, db] = await this.#context();
    return runTransaction(db, [DATASETS, VIEWS], "readonly", async (tx) => {
      const dataset = await idbRequest(tx.objectStore(DATASETS).get(datasetId));
      if (!dataset || !canSee(dataset, me)) return [];
      const views = await idbRequest(
        tx.objectStore(VIEWS).index("datasetId").getAll(datasetId),
      );
      return views.sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
    });
  }

  async create({ datasetId, name, config }) {
    const [me, db] = await this.#context();
    if (me === null) {
      throw new PermissionError("ログインが必要です");
    }
    return runTransaction(db, [DATASETS, VIEWS], "readwrite", async (tx) => {
      await getVisibleDataset(tx, datasetId, me); // 見えない・存在しない親は NotFoundError
      const now = nowIso();
      const view = {
        id: newId(),
        datasetId,
        ownerId: me.id,
        name,
        config: structuredClone(config),
        createdAt: now,
        updatedAt: now,
      };
      tx.objectStore(VIEWS).add(view);
      return view;
    });
  }

  async update(id, { name, config } = {}) {
    const [me, db] = await this.#context();
    return runTransaction(db, [DATASETS, VIEWS], "readwrite", async (tx) => {
      const view = await this.#getVisibleView(tx, id, me);
      assertOwner(view, me, "作成者のみ更新できます");
      const updated = { ...view, updatedAt: nowIso() };
      if (name !== undefined) updated.name = name;
      if (config !== undefined) updated.config = structuredClone(config);
      tx.objectStore(VIEWS).put(updated);
      return updated;
    });
  }

  async remove(id) {
    const [me, db] = await this.#context();
    await runTransaction(db, [DATASETS, VIEWS], "readwrite", async (tx) => {
      const view = await this.#getVisibleView(tx, id, me);
      assertOwner(view, me, "作成者のみ削除できます");
      tx.objectStore(VIEWS).delete(id);
    });
  }

  /** view を取得する。存在しない、または親 dataset が見えないときは NotFoundError。 */
  async #getVisibleView(tx, id, me) {
    const view = await idbRequest(tx.objectStore(VIEWS).get(id));
    if (!view) throw new NotFoundError("見つかりません");
    await getVisibleDataset(tx, view.datasetId, me);
    return view;
  }

  async #context() {
    return Promise.all([
      this.#auth.getCurrentUser(),
      openLocalDb(this.#dbName),
    ]);
  }
}
