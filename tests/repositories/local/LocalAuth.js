/**
 * テスト用の AuthRepository（メモリ上のユーザー一覧で signIn する）。テストファイルではない。
 * 本番は src/repositories/supabase/SupabaseAuth.js（ユーザーは管理者が Supabase で作る）。
 * 状態はインスタンスごとに持つ。パスワードは外へ出さない。
 */

/** @param {{id: string, email: string, displayName: string}} u */
const toPublicUser = ({ id, email, displayName }) => ({
  id,
  email,
  displayName,
});

export class LocalAuth {
  #users;
  #current = null;
  #listeners = new Set();

  /** @param {{users: Array<{id: string, email: string, password: string, displayName: string}>}} options */
  constructor({ users }) {
    this.#users = users.map((u) => ({ ...u }));
  }

  async signIn(email, password) {
    const user = this.#users.find(
      (u) => email && password && u.email === email && u.password === password,
    );
    if (!user) {
      throw new Error("メールアドレスまたはパスワードが違います");
    }
    this.#current = user;
    const publicUser = toPublicUser(user);
    this.#notify(publicUser);
    return publicUser;
  }

  async signOut() {
    if (this.#current === null) return;
    this.#current = null;
    this.#notify(null);
  }

  async getCurrentUser() {
    return this.#current ? toPublicUser(this.#current) : null;
  }

  onAuthChange(cb) {
    this.#listeners.add(cb);
    return () => {
      this.#listeners.delete(cb);
    };
  }

  #notify(user) {
    for (const cb of [...this.#listeners]) {
      try {
        cb(user ? { ...user } : null);
      } catch (e) {
        console.error(e);
      }
    }
  }
}
