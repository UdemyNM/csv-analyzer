import { useEffect, useId, useRef, useState } from "react";
import { Accessibility } from "@dnd-kit/dom";
import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react";

/**
 * 列名のドラッグ＆ドロップの土台（設計書 7.1）。@dnd-kit/react を使う。
 * - ドラッグ元（DraggableField）は data = { field, from } を、ドロップ先（枠・チップ）は data = { slot, index? } を持つ。
 *   列名は id に入れず data でだけ運ぶ（「:」「/」を含む列名でも壊れない）
 * - ドロップの結果は onMove({ field, from, to }) で親に渡す（applyFieldMove の第 2 引数の形）
 * - ドラッグできない人のために、各枠に「＋」ボタン（列を選んで追加）と ×（外す）を置く
 */

/** DragDropProvider の onDragEnd を onMove の形にする（単体でテストできるよう export） */
export function handleDragEnd(event, onMove) {
  if (event.canceled) return;
  const { source, target } = event.operation;
  const field = source?.data?.field;
  if (field === undefined) return;
  let to = null;
  if (target?.data?.slot) {
    to =
      target.data.index === undefined
        ? { slot: target.data.slot }
        : { slot: target.data.slot, index: target.data.index };
  }
  onMove({ field, from: source.data.from ?? null, to });
}

const fieldOf = (event) => event.operation.source?.data?.field ?? "";
const slotLabelOf = (target) => target?.data?.label;

/** スクリーンリーダーへの知らせ（日本語・列名と枠の名前で。内部の id は読まない） */
export const ANNOUNCEMENTS = {
  dragstart: (event) => `列「${fieldOf(event)}」を持ち上げました。`,
  dragover: (event) => {
    const label = slotLabelOf(event.operation.target);
    return label ? `「${label}」の枠の上です。` : undefined;
  },
  dragend: (event) => {
    const field = fieldOf(event);
    if (event.canceled) return `列「${field}」の移動をやめました。`;
    const label = slotLabelOf(event.operation.target);
    return label
      ? `列「${field}」を「${label}」の枠に置きました。`
      : `列「${field}」を枠の外に置きました。`;
  },
};

export const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    "スペースキーで列を持ち上げ、矢印キーで枠へ動かし、もう一度スペースキーで置きます。Esc キーでやめます。ドラッグしなくても、各枠の「＋」ボタンから列を追加できます。",
};

const plugins = (defaults) => [
  ...defaults.filter((plugin) => plugin !== Accessibility),
  Accessibility.configure({
    announcements: ANNOUNCEMENTS,
    screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
  }),
];

export function FieldDndProvider({ onMove, children }) {
  return (
    <DragDropProvider
      plugins={plugins}
      onDragEnd={(event) => handleDragEnd(event, onMove)}
    >
      {children}
    </DragDropProvider>
  );
}

/** ref を 2 つの callback ref に渡す */
const mergeRefs =
  (...refs) =>
  (element) => {
    for (const ref of refs) ref?.(element);
  };

/** 列名のドラッグ元（列名の一覧・データ表の見出し） */
export function DraggableField({ field, from = null, surface, children }) {
  const uid = useId();
  const { ref, isDragging } = useDraggable({
    id: `${surface}-drag-${uid}`,
    data: { field, from },
  });
  return (
    <span
      ref={ref}
      className="field-chip"
      data-dragging={isDragging ? "true" : undefined}
      tabIndex={0}
      aria-roledescription="ドラッグできる列"
      title="集計・グラフの枠へドラッグできます"
    >
      {children ?? field}
    </span>
  );
}

/** 枠の中のチップ。ドラッグ元であり、ドロップ先（その位置に入れる）でもある */
function SlotChip({ slot, surface, index, item, label, onRemove, extra }) {
  const uid = useId();
  const draggable = useDraggable({
    id: `${surface}-${slot}-chip-${uid}`,
    data: { field: item.field, from: { slot, index } },
  });
  const droppable = useDroppable({
    id: `${surface}-${slot}-chipdrop-${uid}`,
    data: { slot, index, label },
  });
  // li はリストの項目のまま（中の × や集計方法の select を読み上げで操作できるように）。
  // ドラッグの役割（role・操作の説明）は、取っ手にした列名の部分に付く
  return (
    <li
      ref={mergeRefs(draggable.ref, droppable.ref)}
      className="chip slot-chip"
      data-dragging={draggable.isDragging ? "true" : undefined}
      data-drop-target={droppable.isDropTarget ? "true" : undefined}
    >
      <span
        ref={draggable.handleRef}
        className="slot-chip__handle"
        tabIndex={0}
        aria-roledescription="ドラッグできる列"
      >
        {item.label}
      </span>
      {extra}
      <button
        type="button"
        className="chip__remove"
        aria-label={`${label}から「${item.label}」を外す`}
        onClick={() => onRemove(index)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </li>
  );
}

/**
 * ドロップ先の枠（ピボットの行・列・値、グラフの X軸・系列・Y軸、散布図の X/Y）。
 * @param {{ slot: string, surface: string, label: string, items: { field: string, label: string }[],
 *   addOptions: { name: string }[], onAdd: (field: string) => void, onRemove: (index: number) => void,
 *   renderChipExtra?: (item: object, index: number) => any }} props
 */
export function FieldSlot({
  slot,
  surface,
  label,
  items,
  addOptions,
  onAdd,
  onRemove,
  renderChipExtra,
}) {
  const labelId = useId();
  const { ref, isDropTarget } = useDroppable({
    id: `${surface}-${slot}`,
    data: { slot, label },
  });

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className="field-slot"
      data-drop-target={isDropTarget ? "true" : undefined}
    >
      <div className="field-slot__head">
        <span id={labelId} className="field-slot__label">
          {label}
        </span>
        <AddFieldButton label={label} options={addOptions} onAdd={onAdd} />
      </div>
      {items.length > 0 ? (
        <ul className="chips field-slot__chips">
          {items.map((item, index) => (
            <SlotChip
              key={`${item.field}-${index}`}
              slot={slot}
              surface={surface}
              index={index}
              item={item}
              label={label}
              onRemove={onRemove}
              extra={renderChipExtra?.(item, index)}
            />
          ))}
        </ul>
      ) : (
        <p className="field-slot__empty muted">ここに列を置く</p>
      )}
      {isDropTarget && items.length > 0 && (
        <p className="field-slot__hint">ここに置く</p>
      )}
    </div>
  );
}

/** 「＋」: 列名の一覧を出し、選ぶと onAdd。Esc・外側で閉じる */
function AddFieldButton({ label, options, onAdd }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    listRef.current?.querySelector("button")?.focus();
    const onPointerDown = (event) => {
      if (
        !listRef.current?.contains(event.target) &&
        !buttonRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <span className="add-field">
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn add-field__button"
        aria-label={`${label}に列を追加`}
        aria-expanded={open}
        disabled={options.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">＋</span>
      </button>
      {open && (
        <ul
          ref={listRef}
          className="add-field__list"
          aria-label={`${label}に追加する列`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          {options.map((option) => (
            <li key={option.name}>
              <button
                type="button"
                className="add-field__option"
                onClick={() => {
                  onAdd(option.name);
                  close();
                }}
              >
                {option.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
