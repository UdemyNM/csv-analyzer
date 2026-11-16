import { useCallback, useEffect, useRef, useState } from "react";

const loadingFor = (userId) => ({
  userId,
  status: "loading",
  datasets: [],
  error: null,
});

/**
 * 閲覧できるデータセットの一覧を取得する。
 *
 *   const { datasets, status, error, reload } = useDatasets(datasetRepository, userId)
 *
 * - status: 'loading' | 'ready' | 'error'。datasets は初期・失敗時とも []
 * - userId が変わったら取り直す。前のユーザーの一覧は残さず、遅れて届いた古い応答は捨てる
 *   （他人の非公開データが一瞬でも見えないようにする）
 * - reload() で取り直す
 */
export function useDatasets(repository, userId) {
  const [state, setState] = useState(() => loadingFor(userId));
  const [nonce, setNonce] = useState(0);

  // 呼び出し側が毎回新しいオブジェクトを渡しても、取り直しは userId / reload だけで起こす
  const repositoryRef = useRef(repository);
  repositoryRef.current = repository;

  useEffect(() => {
    let cancelled = false;
    setState((prev) =>
      prev.userId === userId && prev.status === "loading"
        ? prev
        : loadingFor(userId),
    );
    repositoryRef.current.list().then(
      (datasets) => {
        if (!cancelled)
          setState({ userId, status: "ready", datasets, error: null });
      },
      (error) => {
        if (!cancelled)
          setState({ userId, status: "error", datasets: [], error });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // userId が変わった直後の描画でも、前のユーザーの一覧を返さない
  const current = state.userId === userId ? state : loadingFor(userId);
  return {
    datasets: current.datasets,
    status: current.status,
    error: current.error,
    reload,
  };
}
