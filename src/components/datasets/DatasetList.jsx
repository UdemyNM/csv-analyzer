import { Link } from "react-router-dom";
import { VisibilityBadge } from "./VisibilityBadge.jsx";

/**
 * 自分のデータセットと、他人の公開（shared）のデータセットを並べる。
 * 他人の非公開は、渡されても出さない。順序は渡された順。
 */
export function DatasetList({ datasets, currentUser, ownerNames }) {
  const visible = datasets.filter(
    (d) => d.ownerId === currentUser.id || d.visibility === "shared",
  );

  if (visible.length === 0) {
    return (
      <p className="muted">
        まだデータがありません。上の枠にCSVファイルを入れてください。
      </p>
    );
  }

  return (
    <ul className="dataset-list">
      {visible.map((d) => (
        <li key={d.id} className="dataset-list__item">
          <Link to={`/datasets/${d.id}`} className="dataset-list__name">
            {d.name}
          </Link>
          <VisibilityBadge visibility={d.visibility} />
          <span className="dataset-list__owner">
            作成者: {ownerNames[d.ownerId] ?? "不明なユーザー"}
          </span>
        </li>
      ))}
    </ul>
  );
}
