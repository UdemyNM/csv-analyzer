/**
 * Supabase 実装で共通に使う小さな関数。
 * Postgres / Storage のエラー文言は画面に出さない（内部の情報を漏らさない）。
 */
import { NotFoundError, PermissionError } from "../types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** id は uuid。それ以外は問い合わせる前に「見つからない」とする（型エラーを画面に出さない）。 */
export const isUuid = (id) => typeof id === "string" && UUID.test(id);

export const notFound = () => new NotFoundError("見つかりません");

/** Supabase の { data, error } から data を取り出す。error なら日本語のメッセージで reject する。 */
export function unwrap({ data, error }, failMessage) {
  if (error) {
    // RLS で拒否された（INSERT の WITH CHECK・GRANT の無い操作）
    if (error.code === "42501") throw new PermissionError("権限がありません");
    throw new Error(failMessage);
  }
  return data;
}
