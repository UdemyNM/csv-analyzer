// ui-list トラック共通のテスト補助（テストファイルではない）
import { handleParseRequest } from "../../src/workers/csvParse.worker.js";

export const MAX_BYTES = 10 * 1024 * 1024; // docs/01 FR-10「10MBまで」

export const DEFAULT_CSV = "店舗,売上\n東京,100\n大阪,200\n";

/** CSV の File を作る。size を渡すと、中身は小さいまま size だけ偽装する（10MB を実際に作らない）。 */
export function makeFile(name, content = DEFAULT_CSV, { size } = {}) {
  const file = new File([content], name, { type: "text/csv" });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
}

/** ドロップ／ドラッグ系イベントに渡す dataTransfer */
export const dataTransferOf = (files = []) => ({
  dataTransfer: { files, types: ["Files"], items: [] },
});

/**
 * 本物のパース処理（csvParse.worker.js の handleParseRequest）を、非同期で返す Worker 相当にする。
 * useCsvAnalysis({ createWorker }) / DropZone の createWorker / App の createWorker に渡す。
 */
export function createAutoWorker() {
  return () => {
    const listeners = { message: [], error: [] };
    const worker = {
      onmessage: null,
      onerror: null,
      terminated: false,
      postMessage(message) {
        const response = handleParseRequest(message);
        setTimeout(() => {
          if (worker.terminated) return;
          const event = { data: response };
          worker.onmessage?.(event);
          for (const fn of listeners.message) fn(event);
        }, 0);
      },
      addEventListener(type, fn) {
        (listeners[type] ||= []).push(fn);
      },
      removeEventListener(type, fn) {
        listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
      },
      terminate() {
        worker.terminated = true;
      },
    };
    return worker;
  };
}
