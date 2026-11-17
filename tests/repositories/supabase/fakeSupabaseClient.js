// supabase-js の auth 部分の偽物（テストファイルではない）。
// 実物の振る舞い（公式リファレンス）に合わせる:
//   - signInWithPassword({ email, password }) → { data: { user, session }, error }。失敗は error（理由を区別しない）
//   - getSession() → { data: { session }, error }
//   - signOut() → { error }
//   - onAuthStateChange(cb) → { data: { subscription: { unsubscribe } } }。購読直後に INITIAL_SESSION を非同期で送る
// users: [{ id, email, password, displayName }]（tests/repositories/contract/fixtures.js の USERS と同じ形）
//   displayName は user_metadata.display_name に入れる（管理者がユーザーを作るときに設定する想定）

export function createFakeSupabaseClient({ users, signInError } = {}) {
  let session = null;
  const listeners = new Set();
  const emit = (event) => {
    for (const cb of [...listeners]) cb(event, session);
  };
  const toAuthUser = (u) => ({
    id: u.id,
    email: u.email,
    user_metadata: u.displayName ? { display_name: u.displayName } : {},
    app_metadata: {},
  });

  const auth = {
    async signInWithPassword({ email, password }) {
      if (signInError) {
        return { data: { user: null, session: null }, error: signInError };
      }
      const found = users.find(
        (u) => u.email === email && u.password === password,
      );
      if (!email || !password || !found) {
        return {
          data: { user: null, session: null },
          error: {
            name: "AuthApiError",
            code: "invalid_credentials",
            status: 400,
            message: "Invalid login credentials",
          },
        };
      }
      const user = toAuthUser(found);
      session = { access_token: `token-${found.id}`, user };
      emit("SIGNED_IN");
      return { data: { user, session }, error: null };
    },
    async signOut() {
      session = null;
      emit("SIGNED_OUT");
      return { error: null };
    },
    async getSession() {
      return { data: { session }, error: null };
    },
    onAuthStateChange(cb) {
      listeners.add(cb);
      setTimeout(() => {
        if (listeners.has(cb)) cb("INITIAL_SESSION", session);
      }, 0);
      return {
        data: {
          subscription: {
            unsubscribe: () => listeners.delete(cb),
          },
        },
      };
    },
    /** テスト用: トークン更新（同じユーザーのまま）を起こす */
    __refresh() {
      emit("TOKEN_REFRESHED");
    },
  };
  return { auth };
}
