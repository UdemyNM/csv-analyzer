import { useCallback, useEffect, useState } from "react";

/**
 * AuthRepository の現在のユーザーを React の state にする。
 *
 *   const { user, loading, signIn, signOut } = useAuth(auth)
 *
 * - 初期は loading: true・user: null。getCurrentUser が返ったら loading: false
 * - onAuthChange を購読して user に反映し、アンマウント時に解除する
 * - signIn / signOut は auth へ委譲する（失敗は reject のまま伝える）
 */
export function useAuth(auth) {
  const [state, setState] = useState({ user: null, loading: true });

  useEffect(() => {
    let active = true;
    let changed = false; // onAuthChange を受けたら、それより古い getCurrentUser の結果は使わない
    const unsubscribe = auth.onAuthChange((user) => {
      if (!active) return;
      changed = true;
      setState({ user, loading: false });
    });
    auth.getCurrentUser().then(
      (user) => {
        if (active && !changed) setState({ user, loading: false });
      },
      () => {
        if (active && !changed) setState({ user: null, loading: false });
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth]);

  const signIn = useCallback(
    (email, password) => auth.signIn(email, password),
    [auth],
  );
  const signOut = useCallback(() => auth.signOut(), [auth]);

  return { user: state.user, loading: state.loading, signIn, signOut };
}
