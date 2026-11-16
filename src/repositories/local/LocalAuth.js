/**
 * 擬似ユーザー切替つきの AuthRepository（Local 実装）。
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
    return this.#setCurrent(user);
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

  /** Local 固有: 切替用のユーザー一覧（パスワードなし）。 */
  async listUsers() {
    return this.#users.map(toPublicUser);
  }

  /** Local 固有: パスワード無しでそのユーザーへ切り替える。 */
  async switchUser(userId) {
    const user = this.#users.find((u) => u.id === userId);
    if (!user) {
      throw new Error(`ユーザーが見つかりません: ${userId}`);
    }
    return this.#setCurrent(user);
  }

  #setCurrent(user) {
    this.#current = user;
    const publicUser = toPublicUser(user);
    this.#notify(publicUser);
    return publicUser;
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
