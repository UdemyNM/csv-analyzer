import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  countValues,
  EMPTY_LABEL,
  filterToSelection,
  findValueFilter,
  selectionToFilter,
  VALUE_LIMIT,
} from "../../utils/valueSelection.js";

export const OPERATORS = [
  ["eq", "と等しい (=)"],
  ["ne", "と等しくない (≠)"],
  ["contains", "を含む"],
  ["gt", "より大きい (>)"],
  ["gte", "以上 (≥)"],
  ["lt", "より小さい (<)"],
  ["lte", "以下 (≤)"],
];

const MENU_WIDTH = 280;
const GAP = 8;

/**
 * 列見出しの ▼ メニュー（設計書 6.1）: 並べ替え・絞り込み（値から選ぶ／自由入力）・列の非表示。
 * 値の候補は、開いたときだけ getCandidateRows() から数える（25 万行で毎回数えない）。
 * メニューは表の横スクロールの箱で切れないよう、▼ ボタンの位置に fixed で出す。
 *
 * onAddCondition(filter) は true か、エラーの文言を返す（文言ならメニューを閉じずに出す）。
 */
export function ColumnMenu({
  column,
  getCandidateRows,
  filters,
  sort,
  onSortChange,
  onApplyValues,
  onAddCondition,
  onHide,
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const titleId = useId();
  const active = filters.some((f) => f.column === column.name);

  const close = ({ restoreFocus = false } = {}) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  // 外側を押したら閉じる
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (
        !menuRef.current?.contains(event.target) &&
        !triggerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <span className="column-menu">
      <button
        ref={triggerRef}
        type="button"
        className="column-menu__trigger"
        aria-label={`「${column.name}」の列のメニュー${active ? "（絞り込み中）" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-active={active ? "true" : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{active ? "⧩" : "▾"}</span>
      </button>
      {open && (
        <MenuPanel
          menuRef={menuRef}
          triggerRef={triggerRef}
          titleId={titleId}
          column={column}
          getCandidateRows={getCandidateRows}
          filters={filters}
          sort={sort}
          onSortChange={(next) => {
            onSortChange(next);
            close({ restoreFocus: true });
          }}
          onApplyValues={(filter) => {
            onApplyValues(filter);
            close({ restoreFocus: true });
          }}
          onAddCondition={(filter) => {
            const result = onAddCondition(filter);
            if (result === true) close({ restoreFocus: true });
            return result;
          }}
          onHide={() => {
            close();
            onHide();
          }}
          onClose={() => close({ restoreFocus: true })}
        />
      )}
    </span>
  );
}

function MenuPanel({
  menuRef,
  triggerRef,
  titleId,
  column,
  getCandidateRows,
  filters,
  sort,
  onSortChange,
  onApplyValues,
  onAddCondition,
  onHide,
  onClose,
}) {
  const counts = useMemo(
    () => countValues(getCandidateRows(), column.name),
    [], // eslint-disable-line react-hooks/exhaustive-deps -- 開いたときに 1 回だけ数える
  );
  const allValues = useMemo(() => counts.map((c) => c.value), [counts]);
  const [mode, setMode] = useState("values");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() =>
    filterToSelection(findValueFilter(filters, column.name)?.filter, allValues),
  );
  const [op, setOp] = useState("eq");
  const [value, setValue] = useState("");
  const [error, setError] = useState(null);
  const firstRef = useRef(null);

  // 開いたら最初の操作できる部品へフォーカス
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  // ▼ の真下に出す（画面の右端からはみ出さない）
  const [position] = useState(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return {};
    const maxLeft =
      window.innerWidth -
      Math.min(MENU_WIDTH, window.innerWidth - 2 * GAP) -
      GAP;
    return {
      top: rect.bottom + 4,
      left: Math.max(GAP, Math.min(rect.left, maxLeft)),
    };
  });

  const query = search.trim();
  const matching = query
    ? counts.filter((c) =>
        (c.value === "" ? EMPTY_LABEL : c.value).includes(query),
      )
    : counts;
  const shown = matching.slice(0, VALUE_LIMIT);
  const hiddenCount = query ? 0 : counts.length - shown.length;
  const targets = query ? matching.map((c) => c.value) : allValues;
  const allChecked =
    targets.length > 0 && targets.every((v) => selected.has(v));
  const anySelected = allValues.some((v) => selected.has(v));
  const sortedHere = sort?.column === column.name;

  const toggle = (v) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const v of targets) {
        if (allChecked) next.delete(v);
        else next.add(v);
      }
      return next;
    });

  const submitCondition = (event) => {
    event.preventDefault();
    const result = onAddCondition({ column: column.name, op, value });
    if (result !== true) setError(result);
  };

  return (
    <div
      ref={menuRef}
      role="dialog"
      aria-labelledby={titleId}
      className="column-menu__panel"
      style={position}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <p id={titleId} className="column-menu__title">
        {`「${column.name}」の列の操作`}
      </p>

      <div className="column-menu__row">
        <button
          ref={firstRef}
          type="button"
          className="btn"
          onClick={() =>
            onSortChange({ column: column.name, direction: "asc" })
          }
        >
          昇順
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            onSortChange({ column: column.name, direction: "desc" })
          }
        >
          降順
        </button>
        <button
          type="button"
          className="btn"
          disabled={!sortedHere}
          onClick={() => onSortChange(null)}
        >
          並べ替えを解除
        </button>
      </div>

      <fieldset className="column-menu__modes">
        <legend>絞り込み</legend>
        <label className="check">
          <input
            type="radio"
            name={`${titleId}-mode`}
            checked={mode === "values"}
            onChange={() => setMode("values")}
          />
          <span>値から選ぶ</span>
        </label>
        <label className="check">
          <input
            type="radio"
            name={`${titleId}-mode`}
            checked={mode === "free"}
            onChange={() => setMode("free")}
          />
          <span>自由入力</span>
        </label>
      </fieldset>

      {mode === "values" ? (
        <div className="column-menu__values">
          <input
            type="search"
            className="input"
            aria-label="値を検索"
            placeholder="検索…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="check column-menu__all">
            <input type="checkbox" checked={allChecked} onChange={toggleAll} />
            <span>すべて選択</span>
          </label>
          <ul className="column-menu__list">
            {shown.map((c) => (
              <li key={c.value}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={selected.has(c.value)}
                    onChange={() => toggle(c.value)}
                  />
                  {c.value === "" ? EMPTY_LABEL : c.value}
                  <span className="muted">
                    ({c.count.toLocaleString("ja-JP")})
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {hiddenCount > 0 && (
            <p className="muted column-menu__more">
              {`ほか ${hiddenCount.toLocaleString("ja-JP")} 種類。検索で絞り込んでください`}
            </p>
          )}
          <div className="column-menu__row">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!anySelected}
              onClick={() =>
                onApplyValues(
                  selectionToFilter(column.name, selected, allValues),
                )
              }
            >
              適用
            </button>
            <button type="button" className="btn" onClick={onClose}>
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <form className="column-menu__free" onSubmit={submitCondition}>
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
          {error && (
            <p role="alert" className="column-menu__error">
              {error}
            </p>
          )}
          <div className="column-menu__row">
            <button type="submit" className="btn btn-primary">
              追加
            </button>
            <button type="button" className="btn" onClick={onClose}>
              キャンセル
            </button>
          </div>
        </form>
      )}

      <button type="button" className="btn column-menu__hide" onClick={onHide}>
        この列を非表示
      </button>
    </div>
  );
}
