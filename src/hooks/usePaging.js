import { useState } from "react";

export const PAGE_SIZE = 100;

/**
 * 表の 1 ページ pageSize 行のページング（DataTable・PivotTable で共通）。
 * rows が差し替わったら 1 ページ目に戻る（描画中の state 調整。React 公式のパターン）。
 * @returns {{ page: number, pageCount: number, start: number, visible: any[], goTo: (page: number) => void }}
 */
export function usePaging(rows, pageSize = PAGE_SIZE) {
  const [state, setState] = useState({ rows, page: 0 });
  if (state.rows !== rows) setState({ rows, page: 0 });
  const requested = state.rows === rows ? state.page : 0;

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(requested, pageCount - 1);
  const start = page * pageSize;
  return {
    page,
    pageCount,
    start,
    visible: rows.slice(start, start + pageSize),
    goTo: (next) => setState({ rows, page: next }),
  };
}
