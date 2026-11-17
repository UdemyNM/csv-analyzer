import { Link } from "react-router-dom";

/** ヘッダー: ロゴ / データ一覧 / （children: 右側に差し込む部品）/ 利用者名 / ログアウト。 */
export function AppHeader({ user, onSignOut, children }) {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <span className="app-header__logo">CSV分析ツール</span>
        <nav className="app-header__nav" aria-label="メイン">
          <Link to="/">データ一覧</Link>
        </nav>
        <div className="app-header__right">
          {children}
          <span className="app-header__user">{user.displayName}</span>
          <button type="button" className="btn" onClick={onSignOut}>
            ログアウト
          </button>
        </div>
      </div>
    </header>
  );
}
