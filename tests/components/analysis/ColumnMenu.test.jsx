// 対象: src/components/analysis/ColumnMenu.jsx（列見出しのメニュー。設計書 6.1）
// 契約:
//   <ColumnMenu column={{name,type}} getCandidateRows={() => rows} filters sort
//     onSortChange onApplyValues onAddCondition onHide />
//   - ▼ ボタン（aria-label「「店舗」の列のメニュー」、aria-expanded）で role="dialog" を開く
//   - 値の候補は、開いたときに getCandidateRows() から数える（25 万行で毎回数えない）
//   - onAddCondition(filter) は true か、エラーの文言を返す（文言ならメニューの中に alert で出し、閉じない）
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColumnMenu } from "../../../src/components/analysis/ColumnMenu.jsx";

const ROWS = [
  { 店舗: "東京", 売上: "100" },
  { 店舗: "東京", 売上: "200" },
  { 店舗: "大阪", 売上: "300" },
  { 店舗: "名古屋", 売上: "400" },
  { 店舗: "", 売上: "500" },
];

function setup(props = {}) {
  const handlers = {
    onSortChange: vi.fn(),
    onApplyValues: vi.fn(),
    onAddCondition: vi.fn(() => true),
    onHide: vi.fn(),
  };
  const user = userEvent.setup();
  const utils = render(
    <div>
      <button type="button">外側</button>
      <ColumnMenu
        column={{ name: "店舗", type: "string" }}
        getCandidateRows={() => ROWS}
        filters={[]}
        sort={null}
        {...handlers}
        {...props}
      />
    </div>,
  );
  return { user, ...handlers, ...utils };
}

const trigger = (name = "店舗") =>
  screen.getByRole("button", { name: new RegExp(`「${name}」の列のメニュー`) });
const dialog = () => screen.getByRole("dialog", { name: "「店舗」の列の操作" });
const checkbox = (name) =>
  within(dialog()).getByRole("checkbox", { name: new RegExp(`^${name}`) });

async function open(user) {
  await user.click(trigger());
  return dialog();
}

describe("ColumnMenu: 開閉とフォーカス", () => {
  it("▼ で開き、最初の操作できる部品にフォーカス。Esc で閉じて ▼ に戻る", async () => {
    const { user } = setup();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    await open(user);
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(
      within(dialog()).getByRole("button", { name: "昇順" }),
    ).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("外側をクリックすると閉じる", async () => {
    const { user } = setup();
    await open(user);
    await user.click(screen.getByRole("button", { name: "外側" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("開くまで候補を数えない（getCandidateRows を呼ばない）", async () => {
    const getCandidateRows = vi.fn(() => ROWS);
    const { user } = setup({ getCandidateRows });
    expect(getCandidateRows).not.toHaveBeenCalled();
    await open(user);
    expect(getCandidateRows).toHaveBeenCalled();
  });
});

describe("ColumnMenu: 並べ替え", () => {
  it("昇順で onSortChange（asc）、並べ替えを解除で null", async () => {
    const { user, onSortChange } = setup({
      sort: { column: "店舗", direction: "desc" },
    });
    await open(user);
    await user.click(within(dialog()).getByRole("button", { name: "昇順" }));
    expect(onSortChange).toHaveBeenLastCalledWith({
      column: "店舗",
      direction: "asc",
    });
    await open(user);
    await user.click(
      within(dialog()).getByRole("button", { name: "並べ替えを解除" }),
    );
    expect(onSortChange).toHaveBeenLastCalledWith(null);
  });

  it("この列で並べ替えていなければ「並べ替えを解除」は押せない", async () => {
    const { user } = setup({ sort: { column: "売上", direction: "asc" } });
    await open(user);
    expect(
      within(dialog()).getByRole("button", { name: "並べ替えを解除" }),
    ).toBeDisabled();
  });
});

describe("ColumnMenu: 値から選ぶ", () => {
  it("値と件数が多い順に出て、空欄は「（空欄）」", async () => {
    const { user } = setup();
    await open(user);
    const labels = within(dialog())
      .getAllByRole("checkbox")
      .slice(1) // 先頭は「すべて選択」
      .map((c) => c.closest("label").textContent);
    expect(labels[0]).toBe("東京(2)");
    expect(labels).toContain("（空欄）(1)");
    expect(checkbox("東京")).toBeChecked();
  });

  it("東京だけ外して適用 → notIn（外したほうが少ない）", async () => {
    const { user, onApplyValues } = setup();
    await open(user);
    await user.click(checkbox("東京"));
    await user.click(within(dialog()).getByRole("button", { name: "適用" }));
    expect(onApplyValues).toHaveBeenCalledWith({
      column: "店舗",
      op: "notIn",
      values: ["東京"],
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("全部外すと「適用」が押せない。「すべて選択」で戻る", async () => {
    const { user } = setup();
    await open(user);
    const all = checkbox("すべて選択");
    await user.click(all);
    expect(
      within(dialog()).getByRole("button", { name: "適用" }),
    ).toBeDisabled();
    await user.click(all);
    expect(checkbox("大阪")).toBeChecked();
  });

  it("検索「阪」で大阪だけ。検索中の「すべて選択」は検索に合う値だけを切り替える", async () => {
    const { user, onApplyValues } = setup();
    await open(user);
    await user.type(
      within(dialog()).getByRole("searchbox", { name: "値を検索" }),
      "阪",
    );
    const boxes = within(dialog()).getAllByRole("checkbox");
    expect(boxes).toHaveLength(2); // すべて選択 + 大阪
    await user.click(checkbox("すべて選択")); // 大阪だけ外れる
    await user.click(within(dialog()).getByRole("button", { name: "適用" }));
    expect(onApplyValues).toHaveBeenCalledWith({
      column: "店舗",
      op: "notIn",
      values: ["大阪"],
    });
  });

  it("既存の notIn を開くと、外した値以外にチェックが付いている", async () => {
    const { user } = setup({
      filters: [{ column: "店舗", op: "notIn", values: ["大阪"] }],
    });
    await open(user);
    expect(checkbox("大阪")).not.toBeChecked();
    expect(checkbox("東京")).toBeChecked();
  });

  it("全部選んで適用すると、条件を外す（null）", async () => {
    const { user, onApplyValues } = setup({
      filters: [{ column: "店舗", op: "in", values: ["大阪"] }],
    });
    await open(user);
    await user.click(checkbox("すべて選択"));
    await user.click(within(dialog()).getByRole("button", { name: "適用" }));
    expect(onApplyValues).toHaveBeenCalledWith(null);
  });

  it("1,200 種類なら 1,000 個だけ出し「ほか 200 種類」", async () => {
    const many = Array.from({ length: 1200 }, (_, i) => ({ 店舗: `店${i}` }));
    const { user } = setup({ getCandidateRows: () => many });
    await open(user);
    expect(within(dialog()).getAllByRole("checkbox")).toHaveLength(1001);
    expect(
      within(dialog()).getByText("ほか 200 種類。検索で絞り込んでください"),
    ).toBeInTheDocument();
  });

  it("空欄だけを選んで適用できる", async () => {
    const { user, onApplyValues } = setup();
    await open(user);
    await user.click(checkbox("すべて選択"));
    await user.click(checkbox("（空欄）"));
    await user.click(within(dialog()).getByRole("button", { name: "適用" }));
    expect(onApplyValues).toHaveBeenCalledWith({
      column: "店舗",
      op: "in",
      values: [""],
    });
  });
});

describe("ColumnMenu: 自由入力", () => {
  it("「以上」「300」で追加 → onAddCondition。true なら閉じる", async () => {
    const { user, onAddCondition } = setup({
      column: { name: "売上", type: "number" },
    });
    await user.click(trigger("売上"));
    const d = screen.getByRole("dialog");
    await user.click(within(d).getByRole("radio", { name: "自由入力" }));
    await user.selectOptions(
      within(d).getByRole("combobox", { name: "演算子" }),
      "gte",
    );
    await user.type(within(d).getByRole("textbox", { name: "値" }), "300");
    await user.click(within(d).getByRole("button", { name: "追加" }));
    expect(onAddCondition).toHaveBeenCalledWith({
      column: "売上",
      op: "gte",
      value: "300",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("エラーの文言が返ったら閉じず、alert で出す", async () => {
    const { user } = setup({
      onAddCondition: vi.fn(() => "「abc」は数値として解釈できません"),
    });
    await open(user);
    await user.click(within(dialog()).getByRole("radio", { name: "自由入力" }));
    await user.type(
      within(dialog()).getByRole("textbox", { name: "値" }),
      "abc",
    );
    await user.click(within(dialog()).getByRole("button", { name: "追加" }));
    expect(within(dialog()).getByRole("alert")).toHaveTextContent(
      "数値として解釈できません",
    );
  });
});

describe("ColumnMenu: 列の非表示と目印", () => {
  it("この列を非表示 → onHide して閉じる", async () => {
    const { user, onHide } = setup();
    await open(user);
    await user.click(
      within(dialog()).getByRole("button", { name: "この列を非表示" }),
    );
    expect(onHide).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("条件がある列は ▼ に data-active と「絞り込み中」", () => {
    setup({ filters: [{ column: "店舗", op: "eq", value: "東京" }] });
    expect(trigger()).toHaveAttribute("data-active", "true");
    expect(trigger()).toHaveAccessibleName(
      "「店舗」の列のメニュー（絞り込み中）",
    );
  });

  it("条件がなければ data-active は付かない", () => {
    setup({ filters: [{ column: "売上", op: "eq", value: "1" }] });
    expect(trigger()).not.toHaveAttribute("data-active");
  });
});

describe("ColumnMenu: 画面からはみ出さない位置（ブラウザでの確認で見つかった不具合）", () => {
  it("▼ の下に十分な余白がなければ、▼ の上に出し、高さは画面に収める", async () => {
    const { user } = setup();
    vi.spyOn(trigger(), "getBoundingClientRect").mockReturnValue({
      top: 600,
      bottom: 640,
      left: 100,
      right: 144,
      width: 44,
      height: 40,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 768,
      configurable: true,
    });
    await open(user);
    const style = dialog().style;
    expect(style.top).toBe("");
    expect(style.bottom).toBe(`${768 - 600 + 4}px`); // ▼ の上端の 4px 上
    expect(style.maxHeight).toBe(`${600 - 4 - 8}px`);
  });

  it("下に余白があれば ▼ の下に出し、高さは画面の下端までに収める", async () => {
    const { user } = setup();
    vi.spyOn(trigger(), "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 140,
      left: 100,
      right: 144,
      width: 44,
      height: 40,
    });
    Object.defineProperty(window, "innerHeight", {
      value: 768,
      configurable: true,
    });
    await open(user);
    const style = dialog().style;
    expect(style.top).toBe("144px");
    expect(style.maxHeight).toBe(`${768 - 144 - 8}px`);
  });
});
