/**
 * AuthRepository の Supabase 実装（src/repositories/types.js）。
 * ユーザーは管理者が Supabase のダッシュボードで作る。アプリにはサインアップも擬似ユーザー切替も無い。
 * 現在のユーザーは getSession()（ブラウザに保存されたセッション）から取る。
 * 権限の判定はサーバー側（RLS）で行うので、ここでの値は画面の出し分けにだけ使う。
 */

const WRONG_CREDENTIALS = "メールアドレスまたはパスワードが違います";
const SIGN_IN_FAILED =
  "ログインできませんでした。時間をおいて、もう一度お試しください";

/**
 * Supabase の user を User（id・email・displayName）にする。内部情報は出さない。
 * 表示名は app_metadata.display_name（管理者だけが設定できる）。user_metadata は本人が書き換えられるので使わない。
 */
const toUser = (authUser) =>
  authUser
    ? {
        id: authUser.id,
        email: authUser.email ?? "",
        displayName:
          authUser.app_metadata?.display_name || authUser.email || "",
      }
    : null;

// 認証情報の誤り（未登録・パスワード違い）。理由は区別しない（アカウントの有無を漏らさない）
const isCredentialError = (error) =>
  error.code === "invalid_credentials" || error.status === 400;

export class SupabaseAuth {
  #client;

  /** @param {{client: import("@supabase/supabase-js").SupabaseClient}} options */
  constructor({ client }) {
    this.#client = client;
  }

  async signIn(email, password) {
    if (!email || !password) throw new Error(WRONG_CREDENTIALS);
    const { data, error } = await this.#client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw new Error(
        isCredentialError(error) ? WRONG_CREDENTIALS : SIGN_IN_FAILED,
      );
    }
    return toUser(data.user);
  }

  async signOut() {
    const { error } = await this.#client.auth.signOut();
    if (error) throw new Error("ログアウトできませんでした");
  }

  async getCurrentUser() {
    const { data, error } = await this.#client.auth.getSession();
    if (error) return null;
    return toUser(data.session?.user);
  }

  onAuthChange(cb) {
    let lastId; // 購読ごとに、直前に知らせたユーザー。トークン更新など同じユーザーのままなら知らせない
    const { data } = this.#client.auth.onAuthStateChange((_event, session) => {
      const user = toUser(session?.user);
      const id = user?.id ?? null;
      if (id === lastId) return;
      lastId = id;
      // 公式の注意: このコールバックの中で他の Supabase の処理を待たない。ここでは知らせるだけ
      cb(user);
    });
    return () => data.subscription.unsubscribe();
  }
}
