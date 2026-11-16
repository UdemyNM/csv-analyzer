import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 本物の Worker を作る。Vite は new Worker(new URL(..., import.meta.url), {type:'module'})
 * の形（オプションは静的な値）をワーカーとして認識する。
 */
const createDefaultWorker = () =>
  new Worker(new URL("../workers/csvParse.worker.js", import.meta.url), {
    type: "module",
  });

const IDLE = { status: "idle", data: null, error: null };

/**
 * CSV の原本（ArrayBuffer）を Worker でパースする。
 *
 *   const { status, data, error, parse, reset } = useCsvAnalysis({ createWorker })
 *
 * - status: 'idle' | 'parsing' | 'done' | 'error'
 * - parse(buffer, { encoding, metaOnly }?) は結果（または error.name を保った Error）の Promise を返す。再試行は再度 parse
 *   metaOnly: true なら行（rows）を返さず rowCount を返す（行数・列の型だけ要るとき。行の複製を省く）
 * - 最後に呼んだ parse の結果だけを state に反映する。reset 後に届いた応答は state に反映しない
 * - buffer は複製して Worker へ渡す（呼び出し側の buffer は使えるまま。再試行できる）
 * - アンマウント時に Worker を破棄する
 *
 * @param {{createWorker?: () => Worker}} [options]  テストでは Worker 相当を返す関数を渡す
 */
export function useCsvAnalysis({ createWorker = createDefaultWorker } = {}) {
  const [state, setState] = useState(IDLE);

  const createWorkerRef = useRef(createWorker);
  createWorkerRef.current = createWorker;
  const workerRef = useRef(null);
  const pendingRef = useRef(new Map()); // id -> { resolve, reject }
  const latestIdRef = useRef(null); // state に反映する対象の parse の id
  const nextIdRef = useRef(0);
  const mountedRef = useRef(false);

  const disposeWorker = useCallback(() => {
    const worker = workerRef.current;
    workerRef.current = null;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
  }, []);

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const worker = createWorkerRef.current();
    worker.onmessage = (event) => {
      const { id, ok, result, error } = event.data;
      const entry = pendingRef.current.get(id);
      if (!entry) return;
      pendingRef.current.delete(id);
      const isLatest = latestIdRef.current === id && mountedRef.current;
      if (ok) {
        if (isLatest) setState({ status: "done", data: result, error: null });
        entry.resolve(result);
      } else {
        const err = new Error(error.message);
        err.name = error.name;
        if (isLatest) setState({ status: "error", data: null, error: err });
        entry.reject(err);
      }
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      const message = event.message || "Worker でエラーが発生しました";
      const pending = [...pendingRef.current];
      pendingRef.current.clear();
      // クラッシュした Worker は捨てる（次の parse で作り直す）
      disposeWorker();
      for (const [id, entry] of pending) {
        const err = new Error(message);
        if (latestIdRef.current === id && mountedRef.current) {
          setState({ status: "error", data: null, error: err });
        }
        entry.reject(err);
      }
    };
    workerRef.current = worker;
    return worker;
  }, [disposeWorker]);

  const parse = useCallback(
    (buffer, { encoding, metaOnly } = {}) =>
      new Promise((resolve, reject) => {
        const worker = getWorker();
        const id = ++nextIdRef.current;
        latestIdRef.current = id;
        pendingRef.current.set(id, { resolve, reject });
        setState({ status: "parsing", data: null, error: null });
        const copy = buffer.slice(0);
        const message = { id, buffer: copy };
        if (encoding !== undefined) message.encoding = encoding;
        if (metaOnly === true) message.metaOnly = true;
        worker.postMessage(message, [copy]);
      }),
    [getWorker],
  );

  const reset = useCallback(() => {
    latestIdRef.current = null;
    setState(IDLE);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const pending = pendingRef.current;
    return () => {
      mountedRef.current = false;
      latestIdRef.current = null;
      pending.clear();
      disposeWorker();
    };
  }, [disposeWorker]);

  return { ...state, parse, reset };
}
