// 対象: src/components/datasets/UploadNotice.jsx（名前付き export { UploadNotice }）
// 仕様: docs/05 2 章「分析画面の上部に、アップロード直後だけ『アップロードしました』の帯を出す」
// 契約: props なしで描画でき、role=status で「アップロードしました」を伝える。
//       出すかどうかの判断（location.state.justUploaded）は呼び出し側（詳細画面）が行う
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UploadNotice } from "../../../src/components/datasets/UploadNotice.jsx";

describe("UploadNotice", () => {
  it("「アップロードしました」を role=status で表示する", () => {
    render(<UploadNotice />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "アップロードしました",
    );
  });
});
