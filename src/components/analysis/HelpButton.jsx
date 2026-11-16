/** 用語の横に置く「？」ボタン。開閉の状態は親が持つ（解説は同時に 1 つだけ）。 */
export function HelpButton({ term, expanded, onClick }) {
  return (
    <button
      type="button"
      className="help-button"
      aria-label={`『${term}』とは`}
      aria-expanded={expanded}
      onClick={onClick}
    >
      <span aria-hidden="true">？</span>
    </button>
  );
}

/** 用語の短い解説。role="note"。×で閉じる。 */
export function HelpNote({ term, onClose, children }) {
  return (
    <div role="note" className="help-note">
      <p className="help-note__text">
        <strong>{term}</strong>: {children}
      </p>
      <button
        type="button"
        className="help-note__close"
        aria-label={`『${term}』の解説を閉じる`}
        onClick={onClose}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
