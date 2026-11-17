/**
 * ViewRepository の Supabase 実装（src/repositories/types.js）。
 * view は親 dataset が見える人だけが見られる。update / remove は作成者のみ（RLS。supabase/migrations/）。
 * 親 dataset の削除による cascade は DB（on delete cascade）が行う。
 */
import { PermissionError } from "../types.js";
import { isUuid, notFound, unwrap } from "./supabaseErrors.js";

const COLUMNS =
  "id, dataset_id, owner_id, name, config, created_at, updated_at";

const toView = (row) => ({
  id: row.id,
  datasetId: row.dataset_id,
  ownerId: row.owner_id,
  name: row.name,
  config: row.config,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SupabaseViewRepository {
  #client;
  #auth;

  /** @param {{client: import("@supabase/supabase-js").SupabaseClient, auth: {getCurrentUser: () => Promise<object | null>}}} options */
  constructor({ client, auth }) {
    this.#client = client;
    this.#auth = auth;
  }

  async listByDataset(datasetId) {
    if (!isUuid(datasetId) || !(await this.#auth.getCurrentUser())) return [];
    const rows = unwrap(
      await this.#table()
        .select(COLUMNS)
        .eq("dataset_id", datasetId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true }),
      "ビューを取得できませんでした",
    );
    return rows.map(toView);
  }

  async create({ datasetId, name, config }) {
    if (!(await this.#auth.getCurrentUser())) {
      throw new PermissionError("ログインが必要です");
    }
    if (!isUuid(datasetId)) throw notFound();
    const result = await this.#table()
      .insert({ dataset_id: datasetId, name, config })
      .select(COLUMNS)
      .single();
    // 親が見えない（RLS の WITH CHECK）は PermissionError、親が無い（外部キー）は NotFoundError
    if (result.error?.code === "23503") throw notFound();
    return toView(unwrap(result, "ビューを保存できませんでした"));
  }

  async update(id, { name, config } = {}) {
    if (!isUuid(id) || !(await this.#auth.getCurrentUser())) throw notFound();
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (config !== undefined) patch.config = config;
    if (Object.keys(patch).length === 0) return this.#getVisible(id);

    const rows = unwrap(
      await this.#table().update(patch).eq("id", id).select(COLUMNS),
      "ビューを更新できませんでした",
    );
    if (rows.length === 0) await this.#denied(id, "作成者のみ更新できます");
    return toView(rows[0]);
  }

  async remove(id) {
    if (!isUuid(id) || !(await this.#auth.getCurrentUser())) throw notFound();
    const rows = unwrap(
      await this.#table().delete().eq("id", id).select("id"),
      "ビューを削除できませんでした",
    );
    if (rows.length === 0) await this.#denied(id, "作成者のみ削除できます");
  }

  /** 見える view を 1 件取る。見えない・存在しないときは NotFoundError。 */
  async #getVisible(id) {
    const row = unwrap(
      await this.#table().select(COLUMNS).eq("id", id).maybeSingle(),
      "ビューを取得できませんでした",
    );
    if (!row) throw notFound();
    return toView(row);
  }

  /** 更新・削除が 0 件だったときの理由。見えなければ NotFoundError、見えるが他人のものなら PermissionError。 */
  async #denied(id, message) {
    await this.#getVisible(id);
    throw new PermissionError(message);
  }

  #table() {
    return this.#client.from("views");
  }
}
