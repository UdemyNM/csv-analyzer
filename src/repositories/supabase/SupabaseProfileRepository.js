/**
 * 作成者名の引き当て（profiles テーブル）。表示名は管理者が Supabase で app_metadata に設定する（docs/06）。
 * 表示にだけ使うので、取れなくてもエラーにしない（画面は「不明なユーザー」と出す）。
 */
export class SupabaseProfileRepository {
  #client;

  /** @param {{client: import("@supabase/supabase-js").SupabaseClient}} options */
  constructor({ client }) {
    this.#client = client;
  }

  /** @returns {Promise<Record<string, string>>} { [userId]: 表示名 } */
  async listDisplayNames() {
    const { data, error } = await this.#client
      .from("profiles")
      .select("id, display_name");
    if (error || !data) return {};
    return Object.fromEntries(data.map((p) => [p.id, p.display_name]));
  }
}
