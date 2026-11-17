import { usePaging } from "../../hooks/usePaging.js";
import { COLUMN_KEY_LIMIT, keyLabel, valueLabel } from "../../utils/pivot.js";
import { Pager } from "./DataTable.jsx";
import { formatCell } from "./formatCell.js";

/**
 * 集計結果の表（設計書 7.3）。result は pivot() の戻り値。
 * 列の枠が空なら 1 段の見出し（行の列名 ＋ 値）。列の枠があれば 2 段（上: 列キー、下: 値）。
 * 値が 1 つだけなら値の段は省く。1 ページ 100 行。
 */
export function PivotTable({ result }) {
  const { rowFields, columnFields, values, columnKeys, columnKeyTotal } =
    result;
  const { page, pageCount, start, visible, goTo } = usePaging(result.records);
  const crossTab = columnFields.length > 0;
  const twoRows = crossTab && values.length > 1;

  return (
    <div className="data-table">
      <p className="data-table__count muted">
        {`${result.records.length.toLocaleString("ja-JP")} 件`}
      </p>
      {columnKeyTotal > COLUMN_KEY_LIMIT && (
        <p className="muted">
          {`列が多いため、先頭 ${COLUMN_KEY_LIMIT} 列だけを表示しています（全 ${columnKeyTotal} 列）`}
        </p>
      )}
      <div
        role="region"
        aria-label="集計結果"
        tabIndex={0}
        className="table-scroll"
      >
        <table className="table">
          <thead>
            <tr>
              {rowFields.map((name) => (
                <th key={name} scope="col" rowSpan={twoRows ? 2 : undefined}>
                  {name}
                </th>
              ))}
              {crossTab
                ? columnKeys.map((key, c) => (
                    <th
                      key={c}
                      scope="colgroup"
                      colSpan={twoRows ? values.length : undefined}
                      className="num"
                    >
                      {keyLabel(key)}
                    </th>
                  ))
                : values.map((v, i) => (
                    <th key={i} scope="col" className="num">
                      {valueLabel(v)}
                    </th>
                  ))}
            </tr>
            {twoRows && (
              <tr>
                {columnKeys.flatMap((_, c) =>
                  values.map((v, i) => (
                    <th key={`${c}-${i}`} scope="col" className="num">
                      {valueLabel(v)}
                    </th>
                  )),
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {visible.map((record, r) => (
              <tr key={start + r}>
                {record.rowKey.map((value, i) => (
                  <td key={i}>{keyLabel([value])}</td>
                ))}
                {record.cells.map((value, i) => (
                  <td key={`v${i}`} className="num">
                    {formatCell(value)}
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
