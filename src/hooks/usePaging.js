import { useState } from "react";

export const PAGE_SIZE = 100;

/**
 * 表の 1 ページ pageSize 行のページング（DataTable・PivotTable で共通）。
 * 1 ページ目に戻すきっかけ:
 * - resetKey を渡さないとき: rows が差し替わったら（描画中の state 調整。React 公式のパターン）
 * - resetKey を渡したとき: resetKey が変わったら。rows だけが変わっても（行の非表示など）ページを保つ
 * ページが範囲外になったら、最後のページに寄せる。
 * @returns {{ page: number, pageCount: number, start: number, visible: any[], goTo: (page: number) => void }}
 */
export function usePaging(rows, pageSize = PAGE_SIZE, resetKey) {
  const key = resetKey === undefined ? rows : resetKey;
  const [state, setState] = useState({ key, page: 0 });
  if (state.key !== key) setState({ key, page: 0 });
  const requested = state.key === key ? state.page : 0;

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(requested, pageCount - 1);
  const start = page * pageSize;
  return {
    page,
    pageCount,
    start,
    visible: rows.slice(start, start + pageSize),
    goTo: (next) => setState({ key, page: next }),
  };
}
