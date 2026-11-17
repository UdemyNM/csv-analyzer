/**
 * Local 実装（IndexedDB）の共通部分。
 * - スキーマの作成は onupgradeneeded の中だけ（MDN: Using IndexedDB）
 * - 書き込みの確定は transaction.oncomplete で待つ（request.onsuccess ではない）
 * - トランザクションの途中で IndexedDB 以外の非同期処理を待たない（待つと閉じる）
 */
import { NotFoundError, PermissionError } from "../types.js";

export const DATASETS = "datasets";
export const FILES = "files"; // CSV 原本（ArrayBuffer）。一覧で巨大なバイト列を読まないよう dataset と分ける
export const VIEWS = "views";
const DB_VERSION = 1;

/** @type {Map<string, Promise<IDBDatabase>>} */
const connections = new Map();

/** dbName ごとに接続を共有して開く。 */
export function openLocalDb(dbName) {
  let opening = connections.get(dbName);
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore(DATASETS, { keyPath: "id" });
        db.createObjectStore(FILES, { keyPath: "id" });
        db.createObjectStore(VIEWS, { keyPath: "id" }).createIndex(
          "datasetId",
          "datasetId",
        );
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          connections.delete(dbName);
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
    opening.catch(() => connections.delete(dbName));
    connections.set(dbName, opening);
  }
  return opening;
}

/** IDBRequest を Promise にする。 */
export function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * トランザクションを張って work を実行し、確定（oncomplete）後に work の戻り値で resolve する。
 * work が例外を投げたらトランザクションを中止（ロールバック）し、その例外で reject する。
 * work の中では IDBRequest だけを await すること。
 * @template T
 * @param {IDBDatabase} db
 * @param {string[]} storeNames
 * @param {IDBTransactionMode} mode
 * @param {(tx: IDBTransaction) => Promise<T>} work
 * @returns {Promise<T>}
 */
export function runTransaction(db, storeNames, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    let failure;
    let failed = false;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(
        failed
          ? failure
          : (tx.error ?? new Error("トランザクションが中止されました")),
      );
    work(tx).then(
      (value) => {
        result = value;
      },
      (error) => {
        failed = true;
        failure = error;
        try {
          tx.abort();
        } catch {
          // すでに終了している
        }
      },
    );
  });
}

/**
 * dataset が user から見えるか（ログイン中で、作成者本人、または shared）。docs/02 の RLS 方針。
 * 未ログイン（user が null）には、shared も見せない（FR-02。RLS の対象は authenticated のみ）。
 */
export function canSee(dataset, user) {
  return (
    user !== null &&
    (dataset.visibility === "shared" || dataset.ownerId === user.id)
  );
}

/** 見える dataset を取得する。存在しない・見えないは NotFoundError。 */
export async function getVisibleDataset(tx, id, user) {
  const dataset = await idbRequest(tx.objectStore(DATASETS).get(id));
  if (!dataset || !canSee(dataset, user)) {
    throw new NotFoundError("見つかりません");
  }
  return dataset;
}

/** 作成者本人でなければ PermissionError。 */
export function assertOwner(record, user, message) {
  if (user === null || record.ownerId !== user.id) {
    throw new PermissionError(message);
  }
}

export function newId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export const nowIso = () => new Date().toISOString();
