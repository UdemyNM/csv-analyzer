// 対象: src/components/datasets/DatasetList.jsx（名前付き export { DatasetList }）
// 仕様: docs/05 2 章「自分＋全員公開のデータ一覧（公開範囲バッジ・作成者）」、docs/03 4 章「権限なしは一覧に出さない」、FR-13
// 契約: <DatasetList datasets={Dataset[]} currentUser={{id,...}} ownerNames={{[ownerId]: displayName}} />
//   - ul/li（listitem）で並べる。順序は渡された順（repository.list が新しい順で返す）
//   - 各項目: データセット名のリンク（/datasets/:id）、VisibilityBadge、作成者の表示名
//   - 表示するのは「自分のもの」と「visibility=shared」だけ。他人の private は、渡されても出さない
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DatasetList } from "../../../src/components/datasets/DatasetList.jsx";

const ME = { id: "u-alice", email: "alice@example.com", displayName: "Alice" };
const OWNER_NAMES = { "u-alice": "Alice", "u-bob": "Bob", "u-carol": "Carol" };

const ds = (overrides) => ({
  id: "ds-1",
  ownerId: "u-alice",
  name: "a.csv",
  visibility: "private",
  meta: { rowCount: 1, encoding: "utf-8", columns: [] },
  fileSize: 10,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...overrides,
});

const renderList = (datasets) =>
  render(
    <MemoryRouter>
      <DatasetList
        datasets={datasets}
        currentUser={ME}
        ownerNames={OWNER_NAMES}
      />
    </MemoryRouter>,
  );

describe("DatasetList: 出し分け", () => {
  const mine = ds({
    id: "ds-m",
    name: "mine-private.csv",
    visibility: "private",
  });
  const mineShared = ds({
    id: "ds-ms",
    name: "mine-shared.csv",
    visibility: "shared",
  });
  const othersShared = ds({
    id: "ds-os",
    ownerId: "u-bob",
    name: "bob-shared.csv",
    visibility: "shared",
  });
  const othersPrivate = ds({
    id: "ds-op",
    ownerId: "u-bob",
    name: "bob-private.csv",
    visibility: "private",
  });

  it("自分のもの（非公開・公開）と、他人の公開を表示する", () => {
    renderList([mine, mineShared, othersShared]);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(
      screen.getByRole("link", { name: "mine-private.csv" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "mine-shared.csv" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "bob-shared.csv" }),
    ).toBeInTheDocument();
  });

  it("他人の非公開は、渡されても表示しない", () => {
    renderList([mine, othersShared, othersPrivate]);
    expect(screen.queryByRole("link", { name: "bob-private.csv" })).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("0 件なら項目は出ない", () => {
    renderList([]);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("渡された順に並べる", () => {
    renderList([mineShared, othersShared, mine]);
    const names = screen
      .getAllByRole("listitem")
      .map((li) => within(li).getByRole("link").textContent);
    expect(names).toEqual([
      "mine-shared.csv",
      "bob-shared.csv",
      "mine-private.csv",
    ]);
  });
});

describe("DatasetList: 項目の中身", () => {
  it("名前のリンクは /datasets/:id へ向く", () => {
    renderList([ds({ id: "ds-42", name: "x.csv" })]);
    expect(screen.getByRole("link", { name: "x.csv" })).toHaveAttribute(
      "href",
      "/datasets/ds-42",
    );
  });

  it("公開範囲バッジを文字で出す（非公開／公開）", () => {
    renderList([
      ds({ id: "ds-1", name: "p.csv", visibility: "private" }),
      ds({ id: "ds-2", name: "s.csv", visibility: "shared" }),
    ]);
    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first).getByText("非公開")).toBeInTheDocument();
    expect(within(second).getByText("公開")).toBeInTheDocument();
  });

  it("作成者の表示名を出す（自分のものも他人のものも）", () => {
    renderList([
      ds({ id: "ds-1", name: "mine.csv", ownerId: "u-alice" }),
      ds({
        id: "ds-2",
        name: "bobs.csv",
        ownerId: "u-bob",
        visibility: "shared",
      }),
    ]);
    const [first, second] = screen.getAllByRole("listitem");
    expect(within(first).getByText(/Alice/)).toBeInTheDocument();
    expect(within(second).getByText(/Bob/)).toBeInTheDocument();
  });

  it("アップロード用のリンクや、詳細以外のリンクは持たない", () => {
    renderList([ds({ id: "ds-1", name: "a.csv" })]);
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});
