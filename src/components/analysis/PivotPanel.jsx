import { FN_LABELS, valueLabel } from "../../utils/pivot.js";
import { allowedFns, setValueFn } from "../../utils/pivotEdit.js";
import { DraggableField, FieldSlot } from "../dnd/FieldDnd.jsx";
import { PivotTable } from "./PivotTable.jsx";

export const PIVOT_LABELS = { rows: "行", columns: "列", values: "値" };

/**
 * ピボットの 3 つの枠（行・列・値）。集計パネルとグラフ（X軸・系列・Y軸）で同じものを使う（設計書 8.2: 共通の枠）。
 * surface はドロップ先の id を分けるため（同じ枠を 2 か所に出すので）。
 */
export function PivotSlots({
  columns,
  pivot,
  surface,
  labels = PIVOT_LABELS,
  onMove,
  onPivotChange,
}) {
  const typeOf = (name) =>
    columns.find((c) => c.name === name)?.type ?? "string";
  const fieldItems = (names) =>
    names.map((name) => ({ field: name, label: name }));
  const slots = [
    { slot: "rows", items: fieldItems(pivot?.rows ?? []) },
    { slot: "columns", items: fieldItems(pivot?.columns ?? []) },
    {
      slot: "values",
      items: (pivot?.values ?? []).map((v) => ({
        // column の無い件数（古いビュー由来）は、列名なしで数える
        field: v.column ?? "",
        label: valueLabel(v),
      })),
    },
  ];

  const renderFnSelect = (item, index) => {
    const value = pivot.values[index];
    const fns =
      value.column === undefined ? ["count"] : allowedFns(typeOf(value.column));
    return (
      <select
        className="input input--compact"
        aria-label={`「${item.label}」の集計方法`}
        value={value.fn}
        onChange={(e) =>
          onPivotChange(setValueFn(pivot, index, e.target.value))
        }
      >
        {fns.map((fn) => (
          <option key={fn} value={fn}>
            {FN_LABELS[fn]}
          </option>
        ))}
      </select>
    );
  };

  return (
    <div className="field-slots">
      {slots.map(({ slot, items }) => (
        <FieldSlot
          key={slot}
          slot={slot}
          surface={surface}
          label={labels[slot]}
          items={items}
          addOptions={columns}
          onAdd={(field) => onMove({ field, from: null, to: { slot } })}
          onRemove={(index) =>
            onMove({
              field: items[index].field,
              from: { slot, index },
              to: null,
            })
          }
          renderChipExtra={slot === "values" ? renderFnSelect : undefined}
        />
      ))}
    </div>
  );
}

/**
 * 集計（ピボット）パネル（設計書 7 章）: 列名の一覧（ドラッグ元）・行・列・値の枠・集計結果の表。
 * 計算は親が行い、結果を result で受け取る（グラフも同じ結果を使うため）。
 */
export function PivotPanel({ columns, pivot, result, onMove, onPivotChange }) {
  return (
    <div className="pivot">
      <div className="pivot__fields">
        <p className="field-title">
          列名（枠へドラッグするか、枠の「＋」で追加）
        </p>
        <ul className="field-list" aria-label="列名">
          {columns.map((c) => (
            <li key={c.name}>
              <DraggableField field={c.name} from={null} surface="pivot-list">
                {c.name}
              </DraggableField>
            </li>
          ))}
        </ul>
      </div>
      <PivotSlots
        columns={columns}
        pivot={pivot}
        surface="pivot"
        onMove={onMove}
        onPivotChange={onPivotChange}
      />
      {result ? (
        <PivotTable result={result} />
      ) : (
        <p className="muted">値の枠に列を置くと集計します</p>
      )}
    </div>
  );
}
