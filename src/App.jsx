import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { HashRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppHeader } from "./components/AppHeader.jsx";
import { LoginForm } from "./components/auth/LoginForm.jsx";
import { DatasetList } from "./components/datasets/DatasetList.jsx";
import { DropZone } from "./components/datasets/DropZone.jsx";
import { useAuth } from "./hooks/useAuth.js";
import { useDatasets } from "./hooks/useDatasets.js";

// 詳細画面（分析）は重いので、開くときに読み込む
const DatasetDetailPage = lazy(
  () => import("./components/datasets/DatasetDetailPage.jsx"),
);

/**
 * 作成者名の引き当て用 { [id]: 表示名 }。
 * 他人の表示名は profiles.listDisplayNames() から引く（ログインし直すたびに取り直す）。
 * 取れない・載っていない人は、画面側で「不明なユーザー」と表示される。自分はログイン中のユーザーの表示名を使う。
 */
function useOwnerNames(user, profiles) {
  const id = user?.id;
  const displayName = user?.displayName;
  const [loaded, setLoaded] = useState({ userId: null, names: {} });

  useEffect(() => {
    if (!id || !profiles) return undefined;
    let cancelled = false;
    profiles
      .listDisplayNames()
      .catch(() => ({})) // 表示にだけ使うので、失敗しても一覧は出す
      .then((names) => {
        if (!cancelled) setLoaded({ userId: id, names });
      });
    return () => {
      cancelled = true;
    };
  }, [id, profiles]);

  return useMemo(() => {
    if (!id) return {};
    // 前のユーザーで取った名前は使わない
    const others = loaded.userId === id ? loaded.names : {};
    return { ...others, [id]: displayName };
  }, [id, displayName, loaded]);
}

function AppLayout({ user, onSignOut }) {
  return (
    <>
      <AppHeader user={user} onSignOut={onSignOut} />
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
 * @param {{auth: object, datasets: object, views: object, profiles?: {listDisplayNames: () => Promise<Record<string, string>>}, createWorker?: () => Worker}} props
 *   各 Repository を受け取る（main.jsx で Supabase 実装を渡す。テストでは偽物を渡す）
 */
export default function App({ auth, datasets, views, profiles, createWorker }) {
  const { user, loading, signIn, signOut } = useAuth(auth);
  const ownerNames = useOwnerNames(user, profiles);

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
              <AppLayout user={user} onSignOut={signOut} />
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
