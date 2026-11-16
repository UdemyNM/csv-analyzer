import { useEffect, useRef, useState } from "react";

const OPERATORS = [
  ["eq", "と等しい (=)"],
  ["ne", "と等しくない (≠)"],
  ["contains", "を含む"],
  ["gt", "より大きい (>)"],
  ["gte", "以上 (≥)"],
  ["lt", "より小さい (<)"],
  ["lte", "以下 (≤)"],
];
const OPERATOR_TEXT = {
  eq: "=",
  ne: "≠",
  contains: "を含む",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

const describe = (f) => `${f.column} ${OPERATOR_TEXT[f.op] ?? f.op} ${f.value}`;

/**
 * フィルタバー: 条件チップ（× で削除）・「＋条件を追加」・並べ替え。
 * 条件の検証（InvalidFilterError）は親が行う。onAddFilter が false を返したときは入力欄を開いたままにする。
 *
 * @param {{columns: {name: string, type: string}[], filters: {column: string, op: string, value: string}[],
 *   sort: {column: string, direction: string} | null, onAddFilter: Function, onRemoveFilter: Function,
 *   onSortChange: Function}} props
 */
export function FilterBar({
  columns,
  filters,
  sort,
  onAddFilter,
  onRemoveFilter,
  onSortChange,
}) {
  const [adding, setAdding] = useState(false);
  const addButtonRef = useRef(null);
  const wasAddingRef = useRef(false);
  // 入力欄を閉じたら（追加・キャンセル）、フォーカスを「＋条件を追加」へ戻す（フォーカスが行方不明にならないように）
  useEffect(() => {
    if (wasAddingRef.current && !adding) addButtonRef.current?.focus();
    wasAddingRef.current = adding;
  }, [adding]);
  const [column, setColumn] = useState("");
  const [op, setOp] = useState("eq");
  const [value, setValue] = useState("");

  const selectedColumn = columns.some((c) => c.name === column)
    ? column
    : (columns[0]?.name ?? "");

  const submit = (event) => {
    event.preventDefault();
    if (selectedColumn === "") return;
    const result = onAddFilter({ column: selectedColumn, op, value });
    if (result !== false) {
      setAdding(false);
      setValue("");
    }
  };

  const changeSortColumn = (name) =>
    onSortChange(
      name === ""
        ? null
        : { column: name, direction: sort?.direction ?? "asc" },
    );

  return (
    <div className="card filter-bar">
      <div className="filter-bar__row">
        <ul className="chips" aria-label="絞り込み条件">
          {filters.map((f, i) => (
            <li key={`${i}-${describe(f)}`} className="chip">
              <span>{describe(f)}</span>
              <button
                type="button"
                className="chip__remove"
                aria-label={`条件「${describe(f)}」を削除`}
                onClick={() => onRemoveFilter(i)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
        {!adding && (
          <button
            ref={addButtonRef}
            type="button"
            className="btn"
            onClick={() => setAdding(true)}
          >
            ＋条件を追加
          </button>
        )}
        <div className="filter-bar__sort">
          <span className="filter-bar__sort-label" aria-hidden="true">
            並べ替え
          </span>
          <select
            className="input"
            aria-label="並べ替え"
            value={sort?.column ?? ""}
            onChange={(e) => changeSortColumn(e.target.value)}
          >
            <option value="">なし</option>
            {columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="並べ替えの向き"
            value={sort?.direction ?? "asc"}
            disabled={!sort}
            onChange={(e) =>
              onSortChange({ column: sort.column, direction: e.target.value })
            }
          >
            <option value="asc">昇順</option>
            <option value="desc">降順</option>
          </select>
        </div>
      </div>

      {adding && (
        <form className="filter-bar__form" onSubmit={submit}>
          <select
            className="input"
            aria-label="列"
            autoFocus
            value={selectedColumn}
            onChange={(e) => setColumn(e.target.value)}
          >
            {columns.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="演算子"
            value={op}
            onChange={(e) => setOp(e.target.value)}
          >
            {OPERATORS.map(([v, text]) => (
              <option key={v} value={v}>
                {text}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="input"
            aria-label="値"
            placeholder="値を入力"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            追加
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setAdding(false)}
          >
            キャンセル
          </button>
        </form>
      )}
    </div>
  );
}
