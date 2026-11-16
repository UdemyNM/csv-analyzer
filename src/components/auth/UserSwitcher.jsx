import { useEffect, useId, useState } from "react";

/**
 * 擬似ユーザー切替（Local 実装専用）。
 * switchUser / listUsers を持たない認証（本番）では何も描画しない。
 */
export function UserSwitcher({ auth }) {
  const selectId = useId();
  const enabled =
    typeof auth.switchUser === "function" &&
    typeof auth.listUsers === "function";
  const [users, setUsers] = useState(null); // 読み込むまで null（選択肢が空の select を出さない）
  const [currentId, setCurrentId] = useState("");

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    Promise.all([auth.listUsers(), auth.getCurrentUser()]).then(
      ([list, current]) => {
        if (!active) return;
        setUsers(list);
        setCurrentId((id) => id || current?.id || "");
      },
      (e) => console.error(e),
    );
    const unsubscribe = auth.onAuthChange((user) => {
      if (active) setCurrentId(user?.id ?? "");
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [auth, enabled]);

  if (!enabled || users === null) return null;

  return (
    <div className="user-switcher">
      <label htmlFor={selectId}>ユーザー切替</label>
      <select
        id={selectId}
        className="input"
        value={currentId}
        onChange={(e) =>
          auth.switchUser(e.target.value).catch((err) => console.error(err))
        }
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
