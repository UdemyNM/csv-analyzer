const LABELS = { shared: "公開", private: "非公開" };

/** 公開範囲のバッジ。色だけでなく文字でも示す。 */
export function VisibilityBadge({ visibility }) {
  return (
    <span className={`badge badge--${visibility}`}>{LABELS[visibility]}</span>
  );
}
