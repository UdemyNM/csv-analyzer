import { EMPTY_LABEL } from "../../utils/valueSelection.js";

const OPERATOR_TEXT = {
  eq: "=",
  ne: "≠",
  contains: "を含む",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};
/** in / notIn のチップに並べる値の数。これを超えたら先頭 2 つ＋「ほか N 件」 */
const MAX_LISTED = 3;

const listValues = (values) => {
  const labels = values.map((v) => (v === "" ? EMPTY_LABEL : v));
  return labels.length > MAX_LISTED
    ? `${labels.slice(0, 2).join(", ")} ほか ${labels.length - 2} 件`
    : labels.join(", ");
};

/** チップの文言（設計書 5.2） */
export function describeFilter(f) {
  if (f.op === "in") return `${f.column}: ${listValues(f.values)}`;
  if (f.op === "notIn") return `${f.column}: ${listValues(f.values)} 以外`;
  return `${f.column} ${OPERATOR_TEXT[f.op] ?? f.op} ${f.value}`;
}

function Chip({ text, removeLabel, onRemove }) {
  return (
    <li className="chip">
      <span>{text}</span>
      <button
        type="button"
        className="chip__remove"
        aria-label={removeLabel}
        onClick={onRemove}
      >
        <span aria-hidden="true">×</span>
      </button>
    </li>
  );
}

/**
 * フィルタバー（設計書 5.2）: 絞り込み条件・非表示の行・非表示の列のチップと「すべて解除」。
 * 条件の追加と並べ替えは、データ表の列見出しのメニューで行う。
 */
export function FilterBar({
  filters,
  hiddenRowCount,
  hiddenColumns,
  onRemoveFilter,
  onShowAllRows,
  onShowColumn,
  onClearAll,
}) {
  const empty =
    filters.length === 0 && hiddenRowCount === 0 && hiddenColumns.length === 0;

  return (
    <div className="card filter-bar">
      <div className="filter-bar__row">
        {empty ? (
          <p className="muted filter-bar__hint">
            列見出しの ▼ から絞り込めます
          </p>
        ) : (
          <>
            <ul className="chips" aria-label="絞り込み条件">
              {filters.map((f, i) => (
                <Chip
                  key={`${i}-${describeFilter(f)}`}
                  text={describeFilter(f)}
                  removeLabel={`条件「${describeFilter(f)}」を削除`}
                  onRemove={() => onRemoveFilter(i)}
                />
              ))}
              {hiddenRowCount > 0 && (
                <Chip
                  text={`非表示の行 ${hiddenRowCount.toLocaleString("ja-JP")}件`}
                  removeLabel="非表示の行をすべて表示"
                  onRemove={onShowAllRows}
                />
              )}
              {hiddenColumns.map((name) => (
                <Chip
                  key={`col-${name}`}
                  text={`非表示の列: ${name}`}
                  removeLabel={`列「${name}」を表示`}
                  onRemove={() => onShowColumn(name)}
                />
              ))}
            </ul>
            <button
              type="button"
              className="btn filter-bar__clear"
              onClick={onClearAll}
            >
              すべて解除
            </button>
          </>
        )}
      </div>
    </div>
  );
}
