import { lazy, Suspense, useEffect, useState } from "react";
import { HashRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppHeader } from "./components/AppHeader.jsx";
import { LoginForm } from "./components/auth/LoginForm.jsx";
import { UserSwitcher } from "./components/auth/UserSwitcher.jsx";
import { DatasetList } from "./components/datasets/DatasetList.jsx";
import { DropZone } from "./components/datasets/DropZone.jsx";
import { useAuth } from "./hooks/useAuth.js";
import { useDatasets } from "./hooks/useDatasets.js";

// 詳細画面（分析）は重いので、開くときに読み込む
const DatasetDetailPage = lazy(
  () => import("./components/datasets/DatasetDetailPage.jsx"),
);

/** 作成者名の引き当て用。Local 認証の listUsers() から { [id]: 表示名 } を作る。 */
function useOwnerNames(auth) {
  const [names, setNames] = useState({});
  useEffect(() => {
    if (typeof auth.listUsers !== "function") return undefined;
    let active = true;
    auth.listUsers().then(
      (users) => {
        if (active)
          setNames(Object.fromEntries(users.map((u) => [u.id, u.displayName])));
      },
      (e) => console.error(e),
    );
    return () => {
      active = false;
    };
  }, [auth]);
  return names;
}

function AppLayout({ auth, user, onSignOut }) {
  return (
    <>
      <AppHeader user={user} onSignOut={onSignOut}>
        <UserSwitcher auth={auth} />
      </AppHeader>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}

/** 一覧画面（/）: 上にCSVのドロップ枠、下に自分＋全員公開のデータ一覧。 */
function HomePage({ user, datasets, ownerNames, createWorker }) {
  const { datasets: items, status, reload } = useDatasets(datasets, user.id);
  return (
    <>
      {/* 画面の主見出し（見た目は下のドロップ枠と一覧の見出しで足りるので、読み上げ用） */}
      <h1 className="sr-only">CSVのアップロードとデータ一覧</h1>
      <DropZone datasets={datasets} createWorker={createWorker} />
      <section className="card" aria-labelledby="dataset-list-title">
        <h2 id="dataset-list-title" className="section-title">
          データ一覧
        </h2>
        {status === "loading" && <p role="status">読み込んでいます…</p>}
        {status === "error" && (
          <div role="alert" className="alert">
            <p>データ一覧を取得できませんでした。</p>
            <button type="button" className="btn" onClick={reload}>
              再試行
            </button>
          </div>
        )}
        {status === "ready" && (
          <DatasetList
            datasets={items}
            currentUser={user}
            ownerNames={ownerNames}
          />
        )}
      </section>
    </>
  );
}

/**
 * @param {{auth: object, datasets: object, views: object, createWorker?: () => Worker}} props
 *   各 Repository を受け取る（Local / Supabase を main.jsx で差し替える）
 */
export default function App({ auth, datasets, views, createWorker }) {
  const { user, loading, signIn, signOut } = useAuth(auth);
  const ownerNames = useOwnerNames(auth);

  if (loading) {
    return (
      <p role="status" className="page muted">
        読み込んでいます…
      </p>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <main className="page page--narrow">
                <LoginForm onSignIn={signIn} />
              </main>
            )
          }
        />
        <Route
          element={
            user ? (
              <AppLayout auth={auth} user={user} onSignOut={signOut} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route
            path="/"
            element={
              <HomePage
                user={user}
                datasets={datasets}
                ownerNames={ownerNames}
                createWorker={createWorker}
              />
            }
          />
          <Route
            path="/datasets/:id"
            element={
              <Suspense fallback={<p role="status">読み込んでいます…</p>}>
                {/* ユーザーを切り替えたら作り直す（前のユーザーの表示を残さない） */}
                <DatasetDetailPage
                  key={user?.id}
                  datasetRepository={datasets}
                  viewRepository={views}
                  currentUser={user}
                  ownerNames={ownerNames}
                  createWorker={createWorker}
                  onDatasetsChanged={() => {}} // 一覧は表示のたびに取り直すので、通知先は不要
                />
              </Suspense>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
