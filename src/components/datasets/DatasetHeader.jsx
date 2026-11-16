import { useState } from "react";
import { VisibilityBadge } from "./VisibilityBadge.jsx";
import { VisibilityToggle } from "./VisibilityToggle.jsx";

const ENCODING_LABELS = { "utf-8": "UTF-8", shift_jis: "Shift_JIS" };

/**
 * 詳細画面の概要欄: データセット名・公開範囲バッジ・行数×列数・文字コード・作成者。
 * 作成者本人（isOwner）にだけ、公開範囲の切替・名前の変更・削除を出す。
 * 確認ダイアログ（削除）と保存の実行は親が行う。子要素（ビュー選択など）は常に出す。
 */
export function DatasetHeader({
  dataset,
  ownerName,
  rowCount,
  columnCount,
  encoding,
  isOwner,
  onVisibilityChange,
  onRename,
  onDelete,
  children,
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dataset.name);

  const startEditing = () => {
    setName(dataset.name);
    setEditing(true);
  };
  const submitRename = (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") return;
    setEditing(false);
    onRename(trimmed);
  };

  return (
    <header className="card dataset-header">
      <div className="dataset-header__top">
        <h1 className="dataset-header__name">{dataset.name}</h1>
        <VisibilityBadge visibility={dataset.visibility} />
        {isOwner && (
          <div className="dataset-header__owner-actions">
            <VisibilityToggle
              visibility={dataset.visibility}
              onChange={onVisibilityChange}
            />
            <button type="button" className="btn" onClick={startEditing}>
              名前を変更
            </button>
            <button type="button" className="btn btn-danger" onClick={onDelete}>
              データセットを削除
            </button>
          </div>
        )}
      </div>
      {editing && (
        <form className="dataset-header__rename" onSubmit={submitRename}>
          <input
            type="text"
            className="input"
            aria-label="データセット名"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={name.trim() === ""}
          >
            保存
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setEditing(false)}
          >
            キャンセル
          </button>
        </form>
      )}
      <p className="dataset-header__meta muted">
        <span>{`${rowCount.toLocaleString("ja-JP")} 行 × ${columnCount.toLocaleString("ja-JP")} 列`}</span>
        <span>{`文字コード: ${ENCODING_LABELS[encoding] ?? encoding}`}</span>
        <span>{`作成者: ${ownerName}`}</span>
      </p>
      {children && <div className="dataset-header__extra">{children}</div>}
    </header>
  );
}
