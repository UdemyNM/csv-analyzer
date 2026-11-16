/**
 * 保存済みビューの選択欄。選択中のビューが自分のものなら「編集」「削除」を出す。
 * 他人のビューは選んで見られるが、編集・削除は出さない（権限は Repository 側でも強制される）。
 * 確認ダイアログや保存の実行は親が行う。
 */
export function SavedViewSelect({
  views,
  currentUserId,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
}) {
  const selected = views.find((v) => v.id === selectedId) ?? null;
  const isMine = selected !== null && selected.ownerId === currentUserId;

  return (
    <div className="view-select">
      <label className="inline-field">
        <span>ビュー</span>
        <select
          className="input"
          aria-label="ビュー"
          value={selected?.id ?? ""}
          onChange={(e) =>
            onSelect(e.target.value === "" ? null : e.target.value)
          }
        >
          <option value="">選択なし</option>
          {views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      {isMine && (
        <>
          <button
            type="button"
            className="btn"
            onClick={() => onEdit(selected)}
          >
            ビューを編集
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onDelete(selected)}
          >
            ビューを削除
          </button>
        </>
      )}
    </div>
  );
}
