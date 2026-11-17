import { usePaging } from "../../hooks/usePaging.js";
import { formatCell } from "./formatCell.js";

export { PAGE_SIZE } from "../../hooks/usePaging.js";

/** 数値の列は右寄せにする（見た目だけ。列の型は呼び出し側が渡す） */
const numClass = (column) => (column.type === "number" ? "num" : undefined);

/**
 * 表（1 ページ 100 行のページング）。
 * 表は、名前つきの横スクロールの箱（region・tabIndex=0）に入れる。
 * rows が差し替わったら 1 ページ目に戻る。
 * renderHeader / headerAttrs: 見出しの中身と属性（aria-sort など）を差し替える。
 * resetKey: 渡すと、rows が変わってもページを保ち、resetKey が変わったときだけ 1 ページ目に戻す。
 * onHideRow: あれば各行の左端に「この行を非表示」ボタンを置き、元の行番号（rowIndexOf）を渡す（設計書 6.2）。
 *
 * @param {{columns: {name: string, type?: string}[], rows: object[], label?: string,
 *   renderHeader?: Function, headerAttrs?: Function, rowIndexOf?: Function, onHideRow?: Function}} props
 */
export function DataTable({
  columns,
  rows,
  label = "データ表の内容",
  renderHeader = (column) => column.name,
  headerAttrs = () => ({}),
  rowIndexOf,
  onHideRow,
  resetKey,
}) {
  const { page, pageCount, start, visible, goTo } = usePaging(
    rows,
    undefined,
    resetKey,
  );

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
              {onHideRow && (
                <th scope="col" className="data-table__row-action">
                  <span className="sr-only">行の操作</span>
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.name}
                  scope="col"
                  className={numClass(c)}
                  {...headerAttrs(c)}
                >
                  {renderHeader(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={start + i}>
                {onHideRow && (
                  <td className="data-table__row-action">
                    <HideRowButton
                      index={rowIndexOf ? rowIndexOf(row) : start + i}
                      onHide={onHideRow}
                    />
                  </td>
                )}
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
      <Pager page={page} pageCount={pageCount} onChange={goTo} />
    </div>
  );
}

/** 前へ・次へと「現在 / 総ページ」。1 ページだけなら出さない */
export function Pager({ page, pageCount, onChange }) {
  if (pageCount <= 1) return null;
  return (
    <div className="pager">
      <button
        type="button"
        className="btn"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        前へ
      </button>
      <span className="pager__status">{`${page + 1} / ${pageCount}`}</span>
      <button
        type="button"
        className="btn"
        disabled={page >= pageCount - 1}
        onClick={() => onChange(page + 1)}
      >
        次へ
      </button>
    </div>
  );
}

function HideRowButton({ index, onHide }) {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={`${index + 1} 行目を非表示`}
      title="この行を非表示"
      onClick={() => onHide(index)}
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}
