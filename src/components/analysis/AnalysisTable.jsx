import { filterRows } from "../../utils/filterRows.js";
import { findValueFilter } from "../../utils/valueSelection.js";
import { ColumnMenu } from "./ColumnMenu.jsx";
import { DataTable } from "./DataTable.jsx";

const ARIA_SORT = { asc: "ascending", desc: "descending" };

/** その列の「値から選ぶ」条件（in / notIn）を除いた条件 */
const withoutValueFilter = (filters, column) => {
  const found = findValueFilter(filters, column);
  return found ? filters.filter((_, i) => i !== found.index) : filters;
};

/**
 * データ表（設計書 6 章）: DataTable に、列見出しのメニュー・並べ替えの目印・行の非表示ボタンを足す。
 * 設定の変更は onSettingsChange(patch) で親に返す。自由入力の条件の検証は親（onAddCondition）が行う。
 *
 * @param {{columns: {name: string, type: string}[], rows: object[], baseRows: object[],
 *   rowIndexOf: (row: object) => number, settings: object, onSettingsChange: Function,
 *   onAddCondition: (filter: object) => true | string, renderLabel?: (column: object) => any}} props
 *   rows: 表に出す行（非表示の行を除く → 絞り込み → 並べ替え 後）。baseRows: 非表示の行を除いただけの行
 */
export function AnalysisTable({
  columns,
  rows,
  baseRows,
  rowIndexOf,
  settings,
  onSettingsChange,
  onAddCondition,
  renderLabel = (column) => column.name,
}) {
  const { filters, sort, hiddenColumns, hiddenRows } = settings;
  const hidden = new Set(hiddenColumns);
  const visibleColumns = columns.filter((c) => !hidden.has(c.name));

  // 値の候補: ほかの列の条件をかけたあとの行（自分の列の in/notIn は除く）。不正な条件があれば全件
  const getCandidateRows = (column) => {
    const others = withoutValueFilter(filters, column);
    if (others.length === 0) return baseRows;
    try {
      return filterRows(baseRows, others);
    } catch {
      return baseRows;
    }
  };

  const applyValues = (column, filter) => {
    const others = withoutValueFilter(filters, column);
    onSettingsChange({ filters: filter ? [...others, filter] : others });
  };

  const renderHeader = (column) => (
    <span className="th-menu">
      <span className="th-menu__label">{renderLabel(column)}</span>
      {sort?.column === column.name && (
        <span className="th-menu__sort" aria-hidden="true">
          {sort.direction === "asc" ? "▲" : "▼"}
        </span>
      )}
      <ColumnMenu
        column={column}
        getCandidateRows={() => getCandidateRows(column.name)}
        filters={filters}
        sort={sort}
        onSortChange={(next) => onSettingsChange({ sort: next })}
        onApplyValues={(filter) => applyValues(column.name, filter)}
        onAddCondition={onAddCondition}
        onHide={() =>
          onSettingsChange({ hiddenColumns: [...hiddenColumns, column.name] })
        }
      />
    </span>
  );

  return (
    <DataTable
      columns={visibleColumns}
      rows={rows}
      renderHeader={renderHeader}
      headerAttrs={(column) =>
        sort?.column === column.name
          ? { "aria-sort": ARIA_SORT[sort.direction] }
          : {}
      }
      rowIndexOf={rowIndexOf}
      // 行を隠しても同じページのまま。絞り込み・並べ替えが変わったら 1 ページ目に戻す
      resetKey={JSON.stringify({ filters, sort })}
      onHideRow={(index) =>
        onSettingsChange({ hiddenRows: [...hiddenRows, index] })
      }
    />
  );
}
