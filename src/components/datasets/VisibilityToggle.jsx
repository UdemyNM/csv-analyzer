/**
 * 公開範囲の切替ボタン。今の状態に応じた 1 つだけを出す
 * （非公開なら「公開にする」、公開中なら「非公開にする」）。
 */
export function VisibilityToggle({ visibility, onChange, disabled = false }) {
  const makeShared = visibility === "private";
  return (
    <button
      type="button"
      className="btn"
      disabled={disabled}
      onClick={() => onChange(makeShared ? "shared" : "private")}
    >
      {makeShared ? "公開にする" : "非公開にする"}
    </button>
  );
}
