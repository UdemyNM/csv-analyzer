// 対象: src/main.jsx（エントリーポイント）
// 仕様: CLAUDE.md フォルダ構成（main.jsx）、docs/02 2.1（Local 実装＋擬似ユーザー）、docs/05 7 章（共通CSS src/styles.css）
// 契約:
//   - #root に <App auth datasets views /> を描画する（App は本テストでは vi.mock で代替）
//   - auth は擬似ユーザー切替つき（switchUser があり、listUsers() が 2 人以上）。Local の IndexedDB 実装を渡す
//   - src/styles.css を import する
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("../src/App.jsx", async () => {
  const React = await import("react");
  return {
    default: function AppStub(props) {
      globalThis.__appProps = props;
      return React.createElement("div", { "data-testid": "app-stub" }, "app");
    },
  };
});

describe("main.jsx", () => {
  it("#root に App を描画し、Local の auth / datasets / views を渡す", async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import("../src/main.jsx");
    expect(await screen.findByTestId("app-stub")).toBeInTheDocument();

    const props = globalThis.__appProps;
    expect(typeof props.auth.signIn).toBe("function");
    expect(typeof props.auth.switchUser).toBe("function");
    expect((await props.auth.listUsers()).length).toBeGreaterThanOrEqual(2);
    expect(typeof props.datasets.list).toBe("function");
    expect(typeof props.datasets.create).toBe("function");
    expect(typeof props.views.listByDataset).toBe("function");
  });

  it("共通 CSS（src/styles.css）を import している", () => {
    // jsdom 環境では import.meta.url が file: にならないため、プロジェクト直下から引く
    const source = readFileSync(resolve(process.cwd(), "src/main.jsx"), "utf8");
    expect(source).toMatch(/import\s+['"]\.\/styles\.css['"]/);
  });
});
