/**
 * DatasetRepository の Supabase 実装（src/repositories/types.js）。
 * メタ情報は datasets テーブル、CSV 原本は private バケット csv-files の {作成者id}/{id}.csv。
 * 見える・変えられるの判定は Supabase 側（RLS。supabase/migrations/）で行う。
 * ここでは、RLS の結果（0 件など）を NotFoundError / PermissionError に読み替えるだけ。
 */
import { PermissionError } from "../types.js";
import { isUuid, notFound, unwrap } from "./supabaseErrors.js";

export const CSV_BUCKET = "csv-files";
const COLUMNS =
  "id, owner_id, name, visibility, meta, file_size, created_at, updated_at";
const VISIBILITIES = ["private", "shared"];

/** 原本の場所（datasets.storage_path と同じ規則） */
const csvPath = (ownerId, id) => `${ownerId}/${id}.csv`;

const toDataset = (row) => ({
  id: row.id,
  ownerId: row.owner_id,
  name: row.name,
  visibility: row.visibility,
  meta: row.meta,
  fileSize: row.file_size,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

function assertVisibility(visibility) {
  if (!VISIBILITIES.includes(visibility)) {
    throw new RangeError(
      `visibility は ${VISIBILITIES.join(" / ")} のどちらかです: ${String(visibility)}`,
    );
  }
}

export class SupabaseDatasetRepository {
  #client;
  #auth;

  /** @param {{client: import("@supabase/supabase-js").SupabaseClient, auth: {getCurrentUser: () => Promise<object | null>}}} options */
  constructor({ client, auth }) {
    this.#client = client;
    this.#auth = auth;
  }

  async list() {
    if (!(await this.#auth.getCurrentUser())) return [];
    const rows = unwrap(
      await this.#table()
        .select(COLUMNS)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }),
      "データ一覧を取得できませんでした",
    );
    return rows.map(toDataset);
  }

  async get(id) {
    if (!isUuid(id) || !(await this.#auth.getCurrentUser())) throw notFound();
    const row = unwrap(
      await this.#table().select(COLUMNS).eq("id", id).maybeSingle(),
      "データを取得できませんでした",
    );
    if (!row) throw notFound();
    return toDataset(row);
  }

  async create({ name, visibility, file, meta }) {
    const me = await this.#auth.getCurrentUser();
    if (!me) throw new PermissionError("ログインが必要です");
    assertVisibility(visibility);
    if (typeof file?.arrayBuffer !== "function") {
      throw new TypeError("file（CSV ファイル）が必要です");
    }
    const buffer = await file.arrayBuffer();
    const id = crypto.randomUUID();
    const path = csvPath(me.id, id);

    // 先に原本を置き、行の作成に失敗したら消す（行だけ・ファイルだけが残らないように）
    const { error: uploadError } = await this.#bucket().upload(path, buffer, {
      // ブラウザによって CSV の MIME が違うため固定する（バケットは text/csv だけ受け付ける）
      contentType: "text/csv",
      upsert: false,
    });
    if (uploadError) throw new Error("CSV を保存できませんでした");

    const result = await this.#table()
      .insert({ id, name, visibility, meta, file_size: buffer.byteLength })
      .select(COLUMNS)
      .single();
    if (result.error) {
      await this.#bucket().remove([path]);
      throw new Error("データを保存できませんでした");
    }
    return toDataset(result.data);
  }

  async update(id, { name, visibility } = {}) {
    if (!isUuid(id) || !(await this.#auth.getCurrentUser())) throw notFound();
    if (visibility !== undefined) assertVisibility(visibility);
    const patch = {};
    if (name !== undefined) patch.name = name;
    if (visibility !== undefined) patch.visibility = visibility;
    if (Object.keys(patch).length === 0) return this.get(id);

    const rows = unwrap(
      await this.#table().update(patch).eq("id", id).select(COLUMNS),
      "データを更新できませんでした",
    );
    if (rows.length === 0) await this.#denied(id, "作成者のみ更新できます");
    return toDataset(rows[0]);
  }

  async remove(id) {
    if (!isUuid(id) || !(await this.#auth.getCurrentUser())) throw notFound();
    // 行を消すと、view も消える（on delete cascade）
    const rows = unwrap(
      await this.#table().delete().eq("id", id).select("id, owner_id"),
      "データを削除できませんでした",
    );
    if (rows.length === 0) await this.#denied(id, "作成者のみ削除できます");
    // 原本の削除に失敗しても、行は消えているので画面からは見えない（エラーにしない）
    await this.#bucket().remove([csvPath(rows[0].owner_id, rows[0].id)]);
  }

  async downloadCsv(id) {
    const dataset = await this.get(id);
    const { data, error } = await this.#bucket().download(
      csvPath(dataset.ownerId, dataset.id),
    );
    if (error || !data) throw notFound();
    return data.arrayBuffer();
  }

  /** 更新・削除が 0 件だったときの理由。見えなければ NotFoundError、見えるが他人のものなら PermissionError。 */
  async #denied(id, message) {
    await this.get(id);
    throw new PermissionError(message);
  }

  #table() {
    return this.#client.from("datasets");
  }

  #bucket() {
    return this.#client.storage.from(CSV_BUCKET);
  }
}
