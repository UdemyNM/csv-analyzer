import { useState } from "react";
import { formatCell } from "./formatCell.js";

export const PAGE_SIZE = 100;

/** 数値の列は右寄せにする（見た目だけ。列の型は呼び出し側が渡す） */
const numClass = (column) => (column.type === "number" ? "num" : undefined);

/**
 * 表（1 ページ 100 行のページング）。データ表と集計結果で共通に使う。
 * 表は、名前つきの横スクロールの箱（region・tabIndex=0）に入れる。
 * rows が差し替わったら 1 ページ目に戻る。
 *
 * @param {{columns: {name: string}[], rows: object[], label?: string}} props
 */
export function DataTable({ columns, rows, label = "データ表の内容" }) {
  const [state, setState] = useState({ rows, page: 0 });
  // rows が変わったら先頭ページに戻す（描画中の state 調整。React 公式のパターン）
  if (state.rows !== rows) setState({ rows, page: 0 });
  const requested = state.rows === rows ? state.page : 0;

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(requested, pageCount - 1);
  const start = page * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);
  const goTo = (next) => setState({ rows, page: next });

  return (
    <div className="data-table">
      <p className="data-table__count muted">
        {`${rows.length.toLocaleString("ja-JP")} 件`}
      </p>
      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        className="table-scroll"
      >
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.name} scope="col" className={numClass(c)}>
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={start + i}>
                {columns.map((c) => (
                  <td key={c.name} className={numClass(c)}>
                    {formatCell(row[c.name])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="pager">
          <button
            type="button"
            className="btn"
            disabled={page === 0}
            onClick={() => goTo(page - 1)}
          >
            前へ
          </button>
          <span className="pager__status">{`${page + 1} / ${pageCount}`}</span>
          <button
            type="button"
            className="btn"
            disabled={page >= pageCount - 1}
            onClick={() => goTo(page + 1)}
          >
            次へ
          </button>
        </div>
      )}
    </div>
  );
}
