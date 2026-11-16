/**
 * ピボット・散布図の枠の操作（ドロップ・追加・削除・関数の変更）を行う純粋関数（設計書 7.1 / 8.3）。
 * ドラッグでも「＋」ボタンでも、同じ applyFieldMove を通す。
 *
 * slot: "rows" | "columns" | "values" | "scatterX" | "scatterY"
 * state: { pivot: { rows, columns, values } | null, scatter: { x, y } | null }
 */

const ALL_FNS = ["sum", "avg", "count", "min", "max"];
const SCATTER_SLOTS = { scatterX: "x", scatterY: "y" };

export const defaultFn = (columnType) =>
  columnType === "number" ? "sum" : "count";

export const allowedFns = (columnType) =>
  columnType === "number" ? [...ALL_FNS] : ["count"];

const emptyPivot = () => ({ rows: [], columns: [], values: [] });

const isEmptyPivot = (p) =>
  p.rows.length === 0 && p.columns.length === 0 && p.values.length === 0;

const insertAt = (list, index, item) => {
  const at = index === undefined ? list.length : Math.min(index, list.length);
  return [...list.slice(0, at), item, ...list.slice(at)];
};

/**
 * 列 field を from（枠と位置。一覧からなら null）から to（枠と位置。枠の外なら null）へ動かす。
 * @param {{ pivot: object|null, scatter: object|null }} state
 * @param {{ field: string, from: { slot: string, index: number } | null, to: { slot: string, index?: number } | null }} move
 * @param {(column: string) => string} typeOf
 */
export function applyFieldMove(state, { field, from, to }, typeOf) {
  if (!from && !to) return state;
  // 散布図の軸は数値の列だけ
  if (to && SCATTER_SLOTS[to.slot] && typeOf(field) !== "number") return state;

  let pivot = state.pivot
    ? { ...state.pivot, values: [...state.pivot.values] }
    : emptyPivot();
  let scatter = state.scatter;
  let moved = null; // 値の枠から取り出したもの（関数を保つ）

  // 1. 元の枠から外す
  if (from) {
    if (SCATTER_SLOTS[from.slot]) {
      scatter = {
        ...(scatter ?? { x: "", y: "" }),
        [SCATTER_SLOTS[from.slot]]: "",
      };
    } else if (from.slot === "values") {
      moved = pivot.values[from.index];
      pivot.values.splice(from.index, 1);
    } else {
      pivot[from.slot] = pivot[from.slot].filter((_, i) => i !== from.index);
    }
  }

  // 2. 新しい枠に入れる
  if (to) {
    // 同じ枠の中で後ろへ動かすときは、外した分だけ位置を詰める
    const index =
      from &&
      from.slot === to.slot &&
      to.index !== undefined &&
      from.index < to.index
        ? to.index - 1
        : to.index;
    if (SCATTER_SLOTS[to.slot]) {
      scatter = {
        ...(scatter ?? { x: "", y: "" }),
        [SCATTER_SLOTS[to.slot]]: field,
      };
    } else if (to.slot === "values") {
      const value = moved ?? { column: field, fn: defaultFn(typeOf(field)) };
      const dup = pivot.values.some(
        (v) => v.column === value.column && v.fn === value.fn,
      );
      if (!dup) pivot.values = insertAt(pivot.values, index, value);
    } else {
      // 行と列には同じ列を置かない。同じ枠にあれば位置だけ動かす
      const other = to.slot === "rows" ? "columns" : "rows";
      pivot[other] = pivot[other].filter((name) => name !== field);
      pivot[to.slot] = insertAt(
        pivot[to.slot].filter((name) => name !== field),
        index,
        field,
      );
    }
  }

  return { pivot: isEmptyPivot(pivot) ? null : pivot, scatter };
}

/** 値の index 番目の集計関数を変える（元のオブジェクトは変えない） */
export function setValueFn(pivot, index, fn) {
  return {
    ...pivot,
    values: pivot.values.map((v, i) => (i === index ? { ...v, fn } : v)),
  };
}
